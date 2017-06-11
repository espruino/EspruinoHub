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

var noble = require('noble');
var mqtt = require('./mqttclient');
var config = require('./config');

// List of BLE devices that are currently in range
var inRange = {};
var packetsReceived = 0;
var lastPacketsReceived = 0;
var isScanning = false;


// ----------------------------------------------------------------------
function onStateChange(state) {
  if (state!="poweredOn") return;
  // delay startup to allow Bleno to set discovery up
  setTimeout(function() {
    console.log("Starting scanning...");
    noble.startScanning([], true);
  }, 1000);
};

// ----------------------------------------------------------------------
function onDiscovery(peripheral) {
  packetsReceived++;
  var addr = peripheral.address;
  var id = config.get_device(addr);
  var vendor = config.get_vendor(addr); 
  var entered = !inRange[addr];

  if (entered) {
    inRange[addr] = {
      id : id,
      address : addr,
      peripheral: peripheral,
      name : "?",
      vendor : vendor,
      data : {}
    };
    mqtt.send("/ble/presence/"+id, "1");
  }
  var mqttData = {
    rssi: peripheral.rssi,
  };
  if (peripheral.advertisement.localName) {
    mqttData.name = peripheral.advertisement.localName;
    inRange[addr].name = peripheral.advertisement.localName;
  }
  inRange[addr].lastSeen = Date.now();
  inRange[addr].rssi = peripheral.rssi;

  if (peripheral.advertisement.manufacturerData) {
    var mdata = peripheral.advertisement.manufacturerData.toString('hex');

    // Include the entire raw string, incl. manufacturer, as hex
    mqttData.manufacturerData = mdata;
    mqtt.send("/ble/advertise/"+id, JSON.stringify(mqttData));

    // First two bytes is the manufacturer code (little-endian)
    // re: https://www.bluetooth.com/specifications/assigned-numbers/company-identifiers
    // add code to match hass identification of vendor
    var manu = mdata.slice(2,4) + mdata.slice(0,2); 
    var rest = mdata.slice(4);

    // Split out the manufacturer specific data
    mqtt.send("/ble/advertise/"+id+"/manufacturer/"+manu, JSON.stringify(rest));
  }
  else {
    // No manufacturer specific data
    mqtt.send("/ble/advertise/"+id, JSON.stringify(mqttData));
  }

  mqtt.send("/ble/advertise/"+id+"/rssi", JSON.stringify(peripheral.rssi));

  peripheral.advertisement.serviceData.forEach(function(d) {
    /* Don't keep sending the same old data on MQTT. Only send it if
    it's changed or >1 minute old. */
    if (inRange[addr].data[d.uuid] &&
        inRange[addr].data[d.uuid].payload.toString() == d.data.toString() &&
        inRange[addr].data[d.uuid].time > Date.now()-60000)
     return;

    mqtt.send("/ble/advertise/"+id+"/"+d.uuid, JSON.stringify(d.data));
    inRange[addr].data[d.uuid] = { payload : d.data, time : Date.now() };

    var decoded = attributes.decodeAttribute(d.uuid,d.data);
    if (decoded!=d.data) {
      for (var k in decoded) {
        mqtt.send("/ble/advertise/"+id+"/"+k, JSON.stringify(decoded[k]));
        mqtt.send("/ble/"+k+"/"+id, JSON.stringify(decoded[k]));
      }
    }
  });
}


/** If a BLE device hasn't polled in for 60 seconds, emit a presence event */
function checkForPresence() {
  var timeout = Date.now() - 60*1000; // 60 seconds
  Object.keys(inRange).forEach(function(addr) {
    if (inRange[addr].lastSeen < timeout) {
      mqtt.send("/ble/presence/"+inRange[addr].id, "0");
      delete inRange[addr];
    }
  });
}

function checkIfBroken() {
  // If no packets for 10 seconds, restart
  if (packetsReceived==0 && lastPacketsReceived==0) {
    console.log("BLE broken? No advertising packets in 10 seconds - maybe a devices connected and it's not allowing for scan\n Consider restarting!!");
  }
  lastPacketsReceived = packetsReceived;
  packetsReceived = 0;
}

exports.init = function() {
  noble.on('stateChange',  onStateChange);
  noble.on('discover', onDiscovery);
  noble.on('scanStart', function() { isScanning=true; console.log("Scanning started."); });
  noble.on('scanStop', function() { isScanning=false; console.log("Scanning stopped.");});
  setInterval(checkForPresence, 1000);
  setInterval(checkIfBroken, 5000);
};

exports.inRange = inRange;

exports.restartScan = function() {
  if (!isScanning)
    noble.startScanning([], true);
}

exports.stopScan = function() {
  if (isScanning)
    noble.stopScanning();
}
