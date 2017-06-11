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
 *  Configuration file handling
 * ----------------------------------------------------------------------------
 */

YAML = require("yamljs");

var CONFIG_FILENAME = "/home/homeassistant/.homeassistant/ble-bridge.json";
var HASS_KNOWN_DEVICES = "/home/homeassistant/.homeassistant/known_devices.yaml";

/** If the device is listed here, we use the human readable name
when printing status and publishing on MQTT */
exports.known_devices = {};

/// Load configuration
exports.init = function() {
  var fs = require("fs");
  if (fs.existsSync(CONFIG_FILENAME)) {
    var f = fs.readFileSync(CONFIG_FILENAME).toString();
    var json = {};
    try {
      json = JSON.parse(f);
    } catch (e) {
      console.log("Error parsing "+CONFIG_FILENAME+": "+e);
      return;
    }
    // Load settings
    exports.mqtt_host = json.mqtt_host ? json.mqtt_host : 'mqtt://localhost';
    exports.mqtt_options = json.mqtt_options ? json.mqtt_options : {};
    console.log("Config loaded");
  } else {
    console.log("No "+CONFIG_FILENAME+" found");
  }
  if (fs.existsSync(HASS_KNOWN_DEVICES)) {
    var f = fs.readFileSync(HASS_KNOWN_DEVICES).toString();
    var json = {};
    try {
      json = YAML.parse(f);
    } catch (e) {
      console.log("Error parsing "+HASS_KNOWN_DEVICES+": "+e);
      return;
    }
    // Load settings
    Object.keys(json).forEach(function (k) {
      var mac = json[k]["mac"].toLowerCase();
      expr = mac.split("_");
      mac = expr[1]?expr[1]:expr[9];
      
      exports.known_devices[mac] = json[k]["name"];
    });
    console.log("Known Devices loaded");
  } else {
    console.log("No "+HASS_KNOWN_DEVICES+" found");
  }
};

exports.deviceToAddr = function(id) {
  var addr = id.toLowerCase();
  Object.keys(exports.known_devices).forEach(function(k) {
    if (exports.known_devices[k] == id)
      addr = k;
  });
  return addr;
}
