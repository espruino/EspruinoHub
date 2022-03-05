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

var mqtt       = require("mqtt");
var config     = require("./config");
var connect    = require("./connect");
var devices    = require("./devices");
var discovery  = require("./discovery");
var attributes = require("./attributes");

function log(x) {
  console.log("[MQTT] " + x);
}

log("Connecting...");
var client;
try {
  let options = {
    ...config.mqtt_options,
    will: {
      topic: `${config.mqtt_prefix}/state`,
      payload: "offline",
      retain: true
    }
  }
  client      = mqtt.connect(config.mqtt_host, options);
} catch (e) {
  client = mqtt.connect("mqtt://" + config.mqtt_host);
}

var connected    = false;
var connectTimer = setTimeout(function () {
  connectTimer = undefined;
  log("NOT CONNECTED AFTER 10 SECONDS");
}, 10000);

client.on("error", function (error) {
  log("Connection error:" + error);
});
client.on("connect", function () {
  if (connectTimer) clearTimeout(connectTimer);
  log("Connected");
  connected = true;
  // Subscribe to BLE read and write requests
  client.subscribe(config.mqtt_prefix + "/write/#");
  client.subscribe(config.mqtt_prefix + "/read/#");
  client.subscribe(config.mqtt_prefix + "/notify/#");
  client.subscribe(config.mqtt_prefix + "/ping/#");
  client.publish(`${config.mqtt_prefix}/state`, "online", {retain: true});
  // Push out updated presence info
  discovery.sendMQTTPresence();
});
client.on("close", function () {
  if (connected) {
    log("Disconnected");
    connected = false;
  }
});

exports.client = client;

exports.send = function (topic, message, options) {
  if (connected) client.publish(topic, message, options);
};

function convertMessage(data) {
  data = data.toString();
  try { // if it was JSON, try and parse it (eg arrays/numbers/quoted string,etc)
    data = JSON.parse(data);
  } catch (e) {
    // if it's not parseable, we just use the string as-is
  }
  return data;
}

client.on("message", function (topic, message) {
  if (topic.startsWith(config.mqtt_prefix + "/")) {
    //log(topic+" => "+JSON.stringify(message.toString()));
    var path = topic.substr(1).split("/");
    if (path[1] === "write") {
      var id = devices.deviceToAddr(path[2]);
      if (discovery.inRange[id]) {
        if (path.length === 5) {
          var device  = discovery.inRange[id].peripheral;
          var service = attributes.lookup(path[3].toLowerCase());
          var charc   = attributes.lookup(path[4].toLowerCase());
          connect.write(device, service, charc, convertMessage(message), function () {
            client.publish(config.mqtt_prefix + "/written/" + path[2] + "/" + path[3] + "/" + path[4], message);
          });
        } else {
          log("Invalid number of topic levels");
        }
      } else {
        log("Write to " + id + " but not in range");
      }
    }
    if (path[1] === "read") {
      var id = devices.deviceToAddr(path[2]);
      if (discovery.inRange[id]) {
        var device = discovery.inRange[id].peripheral;
        if (path.length === 5) {
          var service = attributes.lookup(path[3].toLowerCase());
          var charc   = attributes.lookup(path[4].toLowerCase());
          connect.read(device, service, charc, function (data) {
            client.publish(config.mqtt_prefix + "/data/" + path[2] + "/" + path[3] + "/" + path[4], data);
          });
        } else if (path.length === 3) {
          connect.readServices(device, function (data) {
            client.publish(config.mqtt_prefix + "/data/" + path[2], data);
          });
        } else {
          log("Invalid number of topic levels");
        }
      } else {
        log("Read from " + id + " but not in range");
      }
    }
    if (path[1] === "notify") { // start notifications
      if (path.length !== 5) {
        log("Invalid 'notify' packet");
      } else {
        var id = devices.deviceToAddr(path[2]);
        if (discovery.inRange[id]) {
          var device  = discovery.inRange[id].peripheral;
          var service = attributes.lookup(path[3].toLowerCase());
          var charc   = attributes.lookup(path[4].toLowerCase());
          connect.notify(device, service, charc, function (data) {
            // data is a String
            client.publish(config.mqtt_prefix + "/data/" + path[2] + "/" + path[3] + "/" + path[4], data);
          });
        } else {
          log("Notify on " + id + " but not in range");
        }
      }
    }
    if (path[1] === "ping") { // open or keep a connection to a device open
      var id = devices.deviceToAddr(path[2]);
      if (discovery.inRange[id]) {
        var device = discovery.inRange[id].peripheral;
        connect.ping(device, function () {
          client.publish(config.mqtt_prefix + "/pong/" + path[2], message);
        });
      } else {
        log("Ping " + id + " but not in range");
      }
    }
  }
});
