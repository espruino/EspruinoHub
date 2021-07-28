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

exports.exclude_services =  [];
exports.exclude_attributes = [];

/** switch indicating whether discovery should only accept known devices */
exports.only_known_devices = false;

/* How many seconds to wait for a packet before considering BLE connection
broken and exiting. Higher values are useful with slowly advertising sensors.
Setting a value of 0 disables the exit/restart. */
exports.ble_timeout = 10;

/** How many seconds to wait for emitting a presence event, after latest time polled */
exports.presence_timeout = 60;

exports.connection_timeout = 20;

exports.max_connections = 4;

exports.min_rssi = -100;

/* MQTT base path for history requests and output */
exports.history_path = "";

/* time periods used for history */
exports.history_times = {
  minute: 60 * 1000,
  tenminutes: 10 * 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000
};

/* Mqtt topic prefix. For legacy purposes this is configured with a leading
slash. Please note that this is not adviced as it adds an unnecesary level.
For new installation, please remove the slash from the configuration. */
exports.mqtt_prefix = "/ble";

exports.mqtt_advertise                   = true;
exports.mqtt_advertise_manufacturer_data = true;
exports.mqtt_advertise_service_data      = true;
exports.mqtt_format_json                 = true;
exports.mqtt_format_decoded_key_topic    = true;
exports.homeassistant                    = false;

function log(x) {
  console.log("[Config] " + x);
}

/// Load configuration
exports.init = function () {
  var argv            = require("minimist")(process.argv.slice(2), {
    alias: {c: "config"},
    string: ["config"]
  });
  var config_filename = argv.config || CONFIG_FILENAME;
  var fs              = require("fs");
  if (fs.existsSync(config_filename)) {
    var f    = fs.readFileSync(config_filename).toString();
    var json = {};
    try {
      json = JSON.parse(f);
    } catch (e) {
      log("Error parsing " + config_filename + ": " + e);
      return;
    }
    if (json.only_known_devices)
      exports.only_known_devices = json.only_known_devices;
    if (json.ble_timeout)
      exports.ble_timeout = json.ble_timeout;
    if (json.presence_timeout)
      exports.presence_timeout = json.presence_timeout;
    if (json.hasOwnProperty("connection_timeout"))
      exports.connection_timeout = json.connection_timeout;
    if (json.max_connections)
      exports.max_connections = json.max_connections;
    if (json.history_path)
      exports.history_path = json.history_path;
    exports.mqtt_host    = json.mqtt_host ? json.mqtt_host : "mqtt://localhost";
    exports.mqtt_options = json.mqtt_options ? json.mqtt_options : {};
    if (json.mqtt_prefix)
      exports.mqtt_prefix = json.mqtt_prefix;
    if (json.http_whitelist)
      exports.http_whitelist = json.http_whitelist;
    if (json.advertised_services)
      exports.advertised_services = json.advertised_services;
    if (json.http_proxy)
      exports.http_proxy = true;
    if (parseInt(json.http_port))
      exports.http_port = parseInt(json.http_port);

    if (json.hasOwnProperty("mqtt_advertise"))
      exports.mqtt_advertise = json.mqtt_advertise;
    if (json.hasOwnProperty("mqtt_advertise_manufacturer_data"))
      exports.mqtt_advertise_manufacturer_data = json.mqtt_advertise_manufacturer_data;
    if (json.hasOwnProperty("mqtt_advertise_service_data"))
      exports.mqtt_advertise_service_data = json.mqtt_advertise_service_data;
    if (json.hasOwnProperty("mqtt_format_json"))
      exports.mqtt_format_json = json.mqtt_format_json;
    if (json.hasOwnProperty("mqtt_format_decoded_key_topic"))
      exports.mqtt_format_decoded_key_topic = json.mqtt_format_decoded_key_topic;
    if (json.hasOwnProperty("homeassistant"))
      exports.homeassistant = json.homeassistant;

    if (json.hasOwnProperty("min_rssi"))
      exports.min_rssi = json.min_rssi;

    if (json.hasOwnProperty("exclude_services"))
      exports.exclude_services = json.exclude_services;

    if (json.hasOwnProperty("exclude_attributes"))
      exports.exclude_attributes = json.exclude_attributes;


    // Load settings

    if (json.known_devices) {
      const devices = require('./devices');
      Object.keys(json.known_devices).forEach(function (k) {
        devices.known(k, json.known_devices[k]);
      });
    }
    log("Config " + config_filename + " loaded");
  } else {
    log("No " + config_filename + " found");
  }
};
