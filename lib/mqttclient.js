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

function log(x) {
  console.log("<MQTT> "+x);
}

log("Connecting...");
var client;
try       { client = mqtt.connect(config.mqtt_host, config.mqtt_options); }
catch (e) { client = mqtt.connect('mqtt://' + config.mqtt_host); }

var connected = false;
var connectTimer = setTimeout(function() {
  connectTimer = undefined;
  log("NOT CONNECTED AFTER 10 SECONDS");
}, 10000);

client.on('error', function (error) {
  log("Connection error:" + error);
});
client.on('connect', function () {
  if (connectTimer) clearTimeout(connectTimer);
  log("Connected");
  connected = true;
  // Subscribe to BLE read and write requests
  client.subscribe("/ble/write/#");
  client.subscribe("/ble/read/#");
  client.subscribe("/ble/notify/#");
  client.subscribe("/ble/ping/#");
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
  log(topic+" => "+JSON.stringify(message.toString()));
  var path = topic.substr(1).split("/");
  if (path[0]=="ble" && path[1]=="write") {
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     connect.write(device, service, charc, convertMessage(message));
    } else {
      log("Write to "+id+" but not in range");
    }
  }
  if (path[0]=="ble" && path[1]=="read") {
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     connect.read(device, service, charc, function(data) {
       client.publish("/ble/data/"+path[2]+"/"+path[3]+"/"+path[4], data);
     });
    } else {
      log("Read from "+id+" but not in range");
    }
  }
  if (path[0]=="ble" && path[1]=="notify") { // start notifications
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     var service = attributes.lookup(path[3].toLowerCase());
     var charc = attributes.lookup(path[4].toLowerCase());
     connect.notify(device, service, charc, function(data) {
       client.publish("/ble/data/"+path[2]+"/"+path[3]+"/"+path[4], data);
     });
    } else {
      log("Notify on "+id+" but not in range");
    }
  }
  if (path[0]=="ble" && path[1]=="ping") { // open or keep a connection to a device open
    var id = config.deviceToAddr(path[2]);
    if (discovery.inRange[id]) {
     var device = discovery.inRange[id].peripheral;
     connect.ping(device, function() {
       client.publish("/ble/pong/"+path[2], message);
     });
    } else {
      log("Ping "+id+" but not in range");
    }
  }
});
