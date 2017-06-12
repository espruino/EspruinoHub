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
var config = require('./config');
var connect = require('./connect');
var discovery = require('./discovery');
var attributes = require('./attributes');

var client;
try       { client = mqtt.connect(config.mqtt_host, config.mqtt_options); }
catch (e) { client = mqtt.connect('mqtt://' + config.mqtt_host); }

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

function convertMessage(data) {
  data = data.toString();
  try {
    data = JSON.parse(data);
  } catch (e) {
    // if it's not parseable, we just use the string as-is
  }
  return data;
}

client.on('message', function (topic, message) {
  console.log("MQTT>"+topic+" => "+JSON.stringify(message.toString()));
  var path = topic.substr(1).split("/");
  if (path[0]=="ble" && path[1]=="write") {
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     console.log("Service ",service);
     console.log("Characteristic ",charc);
     connect.write(device, service, charc, convertMessage(message));
    } else {
      console.log("Write to "+id+" but not in range");
    }
  }
  if (path[0]=="ble" && path[1]=="read") {
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     console.log("Service ",service);
     console.log("Characteristic ",charc);
     connect.read(device, service, charc, function(data) {
       client.publish("/ble/data/"+path[2]+"/"+service+"/"+charc, data); // added path[2] to the topic
     });
    } else {
      console.log("Read from "+id+" but not in range"); // changed Write to Read
    }
  }
});
