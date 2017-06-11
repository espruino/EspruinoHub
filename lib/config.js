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

var CONFIG_FILENAME = "config.json";

/** If the device is listed here, we use the human readable name
when printing status and publishing on MQTT */
exports.known_devices = {};

/** List of device addresses that are allowed to access the HTTP proxy */
exports.http_whitelist = [];

/** list of services that can be decoded */
exports.advertised_services = {};

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
    if (json.known_devices) {
      Object.keys(json.known_devices).forEach(function (k) {
        exports.known_devices[k.toString().toLowerCase()] = json.known_devices[k];
      });
    }
    exports.mqtt_host = json.mqtt_host ? json.mqtt_host : 'mqtt://localhost';
    exports.mqtt_options = json.mqtt_options ? json.mqtt_options : {};
    if (json.http_whitelist)
      exports.http_whitelist = json.http_whitelist;
    if (json.advertised_services)
      exports.advertised_services = json.advertised_services;
    if (json.http_proxy)
      exports.http_proxy = true;
    console.log("Config loaded");
  } else {
    console.log("No "+CONFIG_FILENAME+" found");
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
