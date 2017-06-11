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
var discovery = require('./discovery');

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
