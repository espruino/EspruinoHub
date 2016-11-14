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
var attributes = require('./attributes');

// List of BLE devices that are currently in range
var inRange = {};

// ----------------------------------------------------------------------
function onStateChange(state) {
  if (state!="poweredOn") return;
  noble.startScanning([], true);
  console.log("Started...");
};

// ----------------------------------------------------------------------
function onDiscovery(peripheral) {
  var id = peripheral.address;
  if (id in config.known_devices)
    id = config.known_devices[id];
  var entered = !inRange[id];

  if (entered) {
    inRange[id] = {
      id : id,
      address : peripheral.address,
      peripheral: peripheral,
      name : "?",
      data : {}
    };
    mqtt.send("/ble/presence/"+id, "1");
  }
  var mqttData = {
    rssi: peripheral.rssi,
  };
  if (peripheral.advertisement.localName) {
    mqttData.name = peripheral.advertisement.localName;
    inRange[id].name = peripheral.advertisement.localName;
  }
  inRange[id].lastSeen = Date.now();
  inRange[id].rssi = peripheral.rssi;

  mqtt.send("/ble/advertise/"+id, JSON.stringify(mqttData));
  mqtt.send("/ble/advertise/"+id+"/rssi", JSON.stringify(peripheral.rssi));

  peripheral.advertisement.serviceData.forEach(function(d) {
    /* Don't keep sending the same old data on MQTT. Only send it if
    it's changed or >1 minute old. */
    if (inRange[id].data[d.uuid] &&
        inRange[id].data[d.uuid].payload.toString() == d.data.toString() &&
        inRange[id].data[d.uuid].time > Date.now()-60000)
     return;

    mqtt.send("/ble/advertise/"+id+"/"+d.uuid, JSON.stringify(d.data));
    inRange[id].data[d.uuid] = { payload : d.data, time : Date.now() };
    if (d.uuid in attributes.handlers) {
      var v = attributes.handlers[d.uuid](d.data);
      for (var k in v) {
        mqtt.send("/ble/advertise/"+id+"/"+k, JSON.stringify(v[k]));
        mqtt.send("/ble/"+k+"/"+id, JSON.stringify(v[k]));
      }
    }
  });
}


/** If a BLE device hasn't polled in for 60 seconds, emit a presence event */
function checkForPresence() {
  var timeout = Date.now() - 60*1000; // 60 seconds
  Object.keys(inRange).forEach(function(id) {
    if (inRange[id].lastSeen < timeout) {
      mqttSend("/ble/presence/"+id, "0");
      delete inRange[id];
    }
  });
}

exports.init = function() {
  noble.on('stateChange',  onStateChange);
  noble.on('discover', onDiscovery);
  setInterval(checkForPresence, 1000);
};

exports.inRange = inRange;
