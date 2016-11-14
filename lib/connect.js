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
 *  Connect to BLE devices
 * ----------------------------------------------------------------------------
 */
var util = require('./util');

var inProgress = false;
var queue = [];

function log(x) {
  console.log("<Connect> "+x);
}

/* Write to the given device */
exports.write = function(device, service, characteristic, data) {
  queue.push({
    type : "write",
    device : device,
    service : service,
    characteristic : characteristic,
    data : data
  });
  if (!inProgress)
    serviceQueue();
};

/* Read from the given device */
exports.read = function(device, service, characteristic, callback) {
  queue.push({
    type : "read",
    device : device,
    service : service,
    characteristic : characteristic,
    callback : callback
  });
  if (!inProgress)
    serviceQueue();
};

function serviceQueue() {
  if (!queue.length) return;
  var job = queue.shift();
  inProgress = true;
  job.device.connect(function (error) {
    if (error) {
      log("Error Connecting");
      if (job.callback) job.callback();
      inProgress = false;
      serviceQueue();
      return;
    }
    log("Connected");
    device.discoverAllServicesAndCharacteristics(function(error, services, characteristics) {
      // TODO: look for characteristic *inside* service
      log("Got characteristics");
      var characteristic;
      for (var i=0;i<characteristics.length;i++)
        if (characteristics[i].uuid==charc)
          characteristic = characteristics[i];
      if (characteristic) {
        log("Found characteristic");

        if (job.type=="write") {
          var data = util.str2buf(job.data.toString());
          // TODO: writing long strings
          characteristic.write(data, false, function() {
            device.disconnect();
            if (job.callback) job.callback();
            inProgress = false;
            serviceQueue();
          });
        } else if (job.type=="read") {
          characteristic.read(function(data) {
            device.disconnect();
            if (job.callback) job.callback(data.toString());
            inProgress = false;
            serviceQueue();
          });
        }
      } else {
        log("No characteristic found");
        device.disconnect();
        if (job.callback) job.callback();
        inProgress = false;
        serviceQueue();
      }
    });
  });
}
