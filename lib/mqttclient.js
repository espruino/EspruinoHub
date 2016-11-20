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
 *  Handling the MQTT connection
 * ----------------------------------------------------------------------------
 */

var mqtt = require('mqtt');
var connect = require('./connect');
var discovery = require('./discovery');
var attributes = require('./attributes');

var client  = mqtt.connect('mqtt://localhost');
var connected = false;

client.on('connect', function () {
  console.log("MQTT Connected");
  connected = true;
  // Subscribe to BLE read and write requests
  client.subscribe("/ble/write/#");
  client.subscribe("/ble/read/#");
});

exports.send = function(topic, message) {
  if (connected) client.publish(topic, message);
};

client.on('message', function (topic, message) {
  console.log("MQTT>"+topic+" => "+JSON.stringify(message.toString()));
  var path = topic.substr(1).split("/");
  if (path[0]=="ble" && path[1]=="write") {
    var id = path[2].toLowerCase();
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     console.log("Service ",service);
     console.log("Characteristic ",charc);
     connect.write(device, service, charc, JSON.parse(message.toString()));
    } else {
      console.log("Write to "+id+" but not in range");
    }
  }
  if (path[0]=="ble" && path[1]=="read") {
    var id = path[2].toLowerCase();
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     console.log("Service ",service);
     console.log("Characteristic ",charc);
     connect.read(device, service, charc, function(data) {
       client.publish("/ble/data/"+service+"/"+charc, data);
     });
    } else {
      console.log("Write to "+id+" but not in range");
    }
  }
});
