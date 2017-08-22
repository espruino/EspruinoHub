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
var discovery = require('./discovery');

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
    service : util.uuid2noble(service),
    characteristic : util.uuid2noble(characteristic),
    data : util.obj2buf(data)
  });
  if (!inProgress)
    serviceQueue();
};

/* Read from the given device */
exports.read = function(device, service, characteristic, callback) {
  queue.push({
    type : "read",
    device : device,
    service : util.uuid2noble(service),
    characteristic : util.uuid2noble(characteristic),
    callback : callback
  });
  if (!inProgress)
    serviceQueue();
};

/* Recursive write to characteristic */
function writeToCharacteristic(characteristic, message) { // added function to write longer strings
  if (message.length) {
    var data = message.slice(0, 20);
    message = message.slice(20);
    characteristic.write(data, false, function() {
      log("wrote data: " + data.length + " bytes");
      writeToCharacteristic(characteristic, message);
    });
  }
}

function serviceQueue() {
  if (!queue.length) {
    discovery.restartScan();
    return;
  }
  var job = queue.shift();
  inProgress = true;
  discovery.stopScan();
  job.device.connect(function (error) {
    if (error) {
      log("Error Connecting: "+error.toString());
      if (job.callback) job.callback();
      inProgress = false;
      serviceQueue();
      return;
    }
    log("Connected. Getting Services...");
    var timeout = setTimeout(function() {
      timeout = undefined;
      log("Timed out getting services. Disconnecting.");
      try { job.device.disconnect(); } catch (e) { log("Disconnect error: "+e); }
      if (job.callback) job.callback();
      inProgress = false;
      serviceQueue();
    }, 4000);
    var matchedService = undefined;
    job.device.discoverServices([job.service], function(error, services) { // do explicit search for known service
      if (services != undefined && services.length) {
        matchedService = services[0];
        log("found service: " + matchedService.uuid);
      }
      if (matchedService) {
        var characteristic = undefined;
        matchedService.discoverCharacteristics([job.characteristic], function(error, characteristics) { // do explicit search for known characteristic
          if (characteristics != undefined && characteristics.length) {
            characteristic = characteristics[0];
            log("found characteristic: " + characteristic.uuid);
          }
          if (characteristic) {
            if (timeout) clearTimeout(timeout);
            if (job.type=="write") {
              log("Writing "+JSON.stringify(job.data)+"...");
              writeToCharacteristic(characteristic, job.data); // allows more than 20 bytes to be written
              setTimeout(function() { // this timeout is important to allow the asynchronous writes to finish
                job.device.disconnect(function() {
                  log("disconnected!");
                  if (job.callback) job.callback();
                  inProgress = false;
                  serviceQueue();
                });
              }, 100); // this might need to be longer in a poor signal situation
            } // if job.type
            else if (job.type=="read") {
              log("Reading...");
              //characteristic.read(function(data) { // found bug: added missing 'error' to the callback parameters - was crashing
              characteristic.read(function(error, data) {
                log("Read. Disconnecting.");
                try { job.device.disconnect(); } catch (e) { log("Disconnect error: "+e); }
                if (job.callback) job.callback(data.toString());
                inProgress = false;
                serviceQueue();
              });
            } // if job.type
          } // if characteristic - no else, the timeout above tidys up
        }); // matchedService.discoverCharacteristics()
      } // if matchedService - no else, the timeout above tidys up
    }); // job.device.discoverServices()
  });
}
