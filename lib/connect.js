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
var queue = [];

var MAX_CONNECTIONS = 4;
var connections = [];

function log(x) {
  console.log("<Connect> "+x);
}

function Connection(device, callback) {
  connections.push(this);
  var connection = this;
  connection.device = device;
  log("Connecting...");
  device.connect(function (error) {
    if (error) {      
      log("Error Connecting: "+error.toString());
      connection.device = undefined;
      connection.close();
      callback("Error Connecting: "+error.toString());
      serviceQueue();      
    } else {
      log("Connected.");
      callback(null);
    }    
  });
}
Connection.prototype.getCharacteristic = function(serviceUUID, characteristicUUID, callback) {
  log("Getting Service...");
  var timeout = setTimeout(function() {
    timeout = undefined;
    log("Timed out getting services.");
    callback("Timed out getting services.");
  }, 4000);
  var matchedService = undefined;
  job.device.discoverServices([serviceUUID], function(error, services) { // do explicit search for known service
    if (services != undefined && services.length) {
      log("found service: " + matchedService.uuid, "getting Characteristic....");
      var matchedService = services[0];
      var characteristic = undefined;
      matchedService.discoverCharacteristics([characteristicUUID], function(error, characteristics) { // do explicit search for known characteristic
        if (timeout) clearTimeout(timeout);
        if (characteristics != undefined && characteristics.length) {
          log("found characteristic: " + characteristic.uuid);
          callback(null, characteristics[0]);
        } else {          
          callback("Characteristic "+characteristicUUID+" not found");        
        }
      });
    } else {
      if (timeout) clearTimeout(timeout);
      callback("Service "+serviceUUID+" not found");        
    }
  });  
}


Connection.prototype.close = function() { 
  if (this.device) {
    try { 
      this.device.disconnect();       
      log("Disconnected");
    } catch (e) { 
      log("Disconnect error: "+e); 
    }
    this.device = undefined;
  }
  var i = connections.indexOf(this);
  if (i>=0) connections.splice(i,1);
  serviceQueue();
};

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

// Repeated write to characteristic 
function writeToCharacteristic(characteristic, message, callback) { // added function to write longer strings
  if (message.length) {
    var data = message.slice(0, 20);
    message = message.slice(20);
    characteristic.write(data, false, function() {
      log("wrote data: " + data.length + " bytes");
      writeToCharacteristic(characteristic, message);
    });
  } else if (callback) callback();
}

function serviceQueue() {
  if (!queue.length) {
    discovery.restartScan();
    return;
  }
  var job = queue.shift();
  discovery.stopScan();
  setTimeout(job, 1000);  
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------


/* Write to the given device */
exports.write = function(device, service, characteristic, data) {
  queue.push(function(){
    var connection = new Connection(device, function(err) {
      if (err) return;
      connection.getCharacteristic(util.uuid2noble(service), 
                                   util.uuid2noble(characteristic),
       function(err,char) {
         if (err) return;
         writeToCharacteristic(char, util.obj2buf(data), function() {
             log("Written. Disconnecting.");
             connection.close();
           });
       });
    });
  });
  serviceQueue();
};

/* Read from the given device */
exports.read = function(device, service, characteristic, callback) {
  queue.push(function(){
    var connection = new Connection(device, function(err) {
      if (err) return;
      connection.getCharacteristic(util.uuid2noble(service), 
                                   util.uuid2noble(characteristic),
       function(err,char) {
         if (err) return;
         characteristic.read(function(error, data) {
           log("Read. Disconnecting.");
           connection.close();
           if (callback) callback(data.toString());
         });
       });
    });
  });
  serviceQueue();
};
