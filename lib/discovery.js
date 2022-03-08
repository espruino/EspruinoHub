/*
 * This file is part of EspruinoHub, a Bluetooth-MQTT bridge for
 * Puck.js/Espruino JavaScript Microcontrollers
 *
 * Copyright (C) 2016 Gordon Williams <gw@pur3.co.uk>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * ----------------------------------------------------------------------------
 *  Converts BLE advertising packets to MQTT
 * ----------------------------------------------------------------------------
 */

var noble;
try {
  noble = require("noble");
} catch (e) {
  noble = require("@abandonware/noble");
}
var mqtt            = require("./mqttclient");
var config          = require("./config");
var attributes      = require("./attributes");
const devices       = require("./devices");
const homeassistant = require("./homeassistant");

// List of BLE devices that are currently in range
var inRange             = {};
var packetsReceived     = 0;
var scanStartTime       = Date.now();

/*
  On some adapters you cannot scan and connect at same time.
  Tested on raspberry pi zero, the first startScan of an app, triggers both stop and start.
  All external stops and starts are received as 'stop' callbacks for every app that is not its self.
  This makes onStart reliable (for when it triggers itself), and onStop unreliable.
  However we can't assume it works this way for all adapters, so try to rely on states as little as possible.
  If Broken BLE restart tests seem best.
*/
var checkBrokenInterval = undefined;
var wishToScan		= false;


function log(x) {
  console.log("[Discover] " + x);
}

// ----------------------------------------------------------------------
var powerOnTimer;
if (config.ble_timeout > 0)
  powerOnTimer = setTimeout(function () {
    powerOnTimer = undefined;
    log("BLE broken? No Noble State Change to 'poweredOn' in " + config.ble_timeout + " seconds - restarting!");
    process.exit(1);
  }, config.ble_timeout * 1000)

function onStateChange(state) {
  log("Noble StateChange: " + state);
  if (state != "poweredOn") return;
  if (powerOnTimer) {
    clearTimeout(powerOnTimer);
    powerOnTimer = undefined;
  }
  // delay startup to allow Bleno to set discovery up
  setTimeout(function () {
    exports.startScan();
  }, 1000);
};

// ----------------------------------------------------------------------
async function onDiscovery(peripheral) {
  packetsReceived++;
  var addr = peripheral.address;
  var id   = addr;
  let dev  = await devices.getByMac(addr);
  if ((config.only_known_devices && !dev.known) || (peripheral.rssi < dev.min_rssi)) {
    return;
  }
  var entered = !inRange[addr];

  if (entered) {
    inRange[addr] = {
      id: id,
      address: addr,
      peripheral: peripheral,
      name: "?",
      dev: dev,
      data: {}
    };
    mqtt.send(dev.presence_topic, "1", {retain: true});
  }
  var mqttData = {
    rssi: peripheral.rssi
  };
  if (peripheral.advertisement.localName) {
    mqttData.name      = peripheral.advertisement.localName;
    inRange[addr].name = peripheral.advertisement.localName;
  }
  if (peripheral.advertisement.serviceUuids)
    mqttData.serviceUuids = peripheral.advertisement.serviceUuids;

  inRange[addr].lastSeen = Date.now();
  inRange[addr].rssi     = peripheral.rssi;

  if (peripheral.advertisement.manufacturerData && config.mqtt_advertise_manufacturer_data) {
    var mdata = peripheral.advertisement.manufacturerData.toString("hex");

    // Include the entire raw string, incl. manufacturer, as hex
    mqttData.manufacturerData = mdata;
    mqtt.send(dev.advertise_topic, JSON.stringify(mqttData));

    // First two bytes is the manufacturer code (little-endian)
    // re: https://www.bluetooth.com/specifications/assigned-numbers/company-identifiers
    var manu = mdata.slice(2, 4) + mdata.slice(0, 2);
    var rest = mdata.slice(4);

    // Split out the manufacturer specific data
    mqtt.send(dev.advertise_topic + "/manufacturer/" + manu, JSON.stringify(rest));
    if (manu == "0590") {
      var str = "";
      for (var i = 0; i < rest.length; i += 2)
        str += String.fromCharCode(parseInt(rest.substr(i, 2), 16));
      var j;
      try {
        /* If we use normal JSON it'll complain about {a:1} because
        it's not {"a":1}. JSON5 won't do that */
        j = require("json5").parse(str);
        mqtt.send(dev.advertise_topic + "/espruino", str);
        if ("object" == typeof j)
          for (var key in j)
            mqtt.send(dev.advertise_topic + "/" + key, JSON.stringify(j[key]));
      } catch (e) {
        // it's not valid JSON, leave it
      }
    }
  } else if (config.mqtt_advertise) {
    // No manufacturer specific data
    mqtt.send(dev.advertise_topic, JSON.stringify(mqttData));
  }


  if(peripheral.advertisement.serviceData) {
    peripheral.advertisement.serviceData.forEach(function (d) {
      /* Don't keep sending the same old data on MQTT. Only send it if
      it's changed or >1 minute old. */
      if (inRange[addr].data[d.uuid] &&
        inRange[addr].data[d.uuid].payload.toString() == d.data.toString() &&
        inRange[addr].data[d.uuid].time > Date.now() - 60000)
        return;

      if (config.mqtt_advertise_service_data) {
        // Send advertising data as a simple JSON array, eg. "[1,2,3]"
        var byteData = [];
        for (var i = 0; i < d.data.length; i++)
          byteData.push(d.data.readUInt8(i));
        mqtt.send(dev.advertise_topic + "/" + d.uuid, JSON.stringify(byteData));
      }

      inRange[addr].data[d.uuid] = {payload: d.data, time: Date.now()};

      var decoded = attributes.decodeAttribute(d.uuid, d.data, dev);
      if (decoded !== d.data) {
        decoded.rssi = peripheral.rssi;
        dev.filterAttributes(decoded);

        if (config.homeassistant) homeassistant.configDiscovery(decoded, dev, peripheral, d.uuid);
        for (var k in decoded) {
          if (config.mqtt_advertise) mqtt.send(config.mqtt_prefix + "/advertise/" + id + "/" + k, JSON.stringify(decoded[k]));
          if (config.mqtt_format_decoded_key_topic) mqtt.send(config.mqtt_prefix + "/" + k + "/" + id, JSON.stringify(decoded[k]));
        }

        if (config.mqtt_format_json) {
          mqtt.send(dev.json_state_topic + "/" + d.uuid, JSON.stringify(dev.getOrSetState(d.uuid, decoded)));
        }
      }
    });
  }
}


/** If a BLE device hasn't polled in for 60? seconds, emit a presence event */
function checkForPresence() {
  var timeout = Date.now() - config.presence_timeout * 1000;

  if (!wishToScan || scanStartTime > timeout)
    return; // don't check, as we're not scanning/haven't had time

  Object.keys(inRange).forEach(function (addr) {
    let timeout = Date.now() - inRange[addr].dev.presence_timeout * 1000;
    if (inRange[addr].lastSeen < timeout) {
      mqtt.send(inRange[addr].dev.presence_topic, "0", {retain: true});
      delete inRange[addr];
    }
  });
}

function checkIfBroken() {
  // If no packets for ble_timeout seconds, restart
  if (packetsReceived == 0) {
    log("BLE broken? No advertising packets in " + config.ble_timeout + " seconds - restarting!");
    process.exit(1);
  }
  packetsReceived     = 0;
}

exports.init = function () {
  noble.on("stateChange", onStateChange);
  noble.on("discover", onDiscovery);
  noble.on("scanStart", function () {
    scanStartTime = Date.now();
    log("Scanning started.");
  });
  noble.on("scanStop", function () {
    //unreliable, because some adapters fire this when other processes start scanning
    log("unreliable scanStop()");
    // if this was us stopping scan, wishToScan would be false
    if ( wishToScan ) {
      // Scanning is lower priority, only way to allow others to connect, drop fast
      process.exit(1);
    }
  });
  setInterval(checkForPresence, 1000);
};

exports.inRange = inRange;

exports.startScan = function () {
  log("caller if " + exports.startScan.caller);
  wishToScan = true;
  if ( config.ble_timeout > 0 && checkBrokenInterval === undefined) {
    log("Spawning check-broken interval");
    checkBrokenInterval = setInterval(checkIfBroken, config.ble_timeout * 1000);
  }
  // Other programs _could_ receive this signal as scanStopped
  noble.startScanning([],true);
  log("Starting Scan");
}

exports.stopScan = function () {
  wishToScan = false;
  if (checkBrokenInterval) {
    clearInterval(checkBrokenInterval);
    checkBrokenInterval = undefined;
  }
  noble.stopScanning();
}

/// Send up to date presence data for all known devices over MQTT (to be done when first connected to MQTT)
exports.sendMQTTPresence = function () {
  log("Re-sending presence status of known devices");
  for (let addr in inRange) {
    mqtt.send(inRange[addr].dev.presence_topic, "1", {retain: true});
  }
  for (let mac in devices.list) {
    if (devices.list[mac].known)
      mqtt.send(devices.list[mac].presence_topic, (devices.list[mac].mac in inRange) ? "1" : "0", {retain: true});
  }
}
