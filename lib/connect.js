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
var CONNECTION_TIMEOUT = 10; // seconds
var connections = [];
var isBusy = false;

function log(x) {
  console.log("<Connect> "+x);
}

function Connection(device, callback) {
  var connection = this;

  connection.secondsSinceUsed = 0;
  connection.device = device;
  connection.name = device.address;
  connection.services = {};
  connections.push(this);

  log(connection.name+": Connecting...");
  device.connect(function (error) {
    if (error) {      
      log(connection.name+": Error Connecting: "+error.toString());
      connection.device = undefined;
      connection.close();
      callback("Error Connecting: "+error.toString());
    } else {
      log("Connected.");
      callback(null, connection);
    }    
  });
}
Connection.prototype.getCharacteristic = function(serviceUUID, characteristicUUID, callback) {
  var connection = this;

  function getCharacteristicFromService(matchedService) {
    matchedService.discoverCharacteristics([characteristicUUID], function(error, characteristics) { // do explicit search for known characteristic
      if (timeout) clearTimeout(timeout);
      if (characteristics != undefined && characteristics.length) {
        var matchedCharacteristic = characteristics[0];
        connection.services[serviceUUID][characteristicUUID] = {
          characteristic : matchedCharacteristic,
          notifyCallback : undefined
        };
        log(connection.name+": found characteristic: " + matchedCharacteristic.uuid);
        callback(null, matchedCharacteristic);
      } else {          
        callback("Characteristic "+characteristicUUID+" not found");        
      }
    });
  }

  // look in cache
  if (connection.services[serviceUUID] &&
      connection.services[serviceUUID][characteristicUUID])
    return callback(null, connection.services[serviceUUID][characteristicUUID].characteristic);

  log(connection.name+": Getting Service...");
  var timeout = setTimeout(function() {
    timeout = undefined;    
    log(connection.name+": Timed out getting services.");
    callback("Timed out getting services.");
  }, 4000);

  if (connection.services[serviceUUID]) {
    getCharacteristicFromService(connection.services[serviceUUID].service);
  } else {
    this.device.discoverServices([serviceUUID], function(error, services) { // do explicit search for known service
      if (services != undefined && services.length) {
        var matchedService = services[0];
        log(connection.name+": found service: " + matchedService.uuid, "getting Characteristic....");
        if (!connection.services[serviceUUID])
          connection.services[serviceUUID] = { service : matchedService };
        getCharacteristicFromService(matchedService);
      } else {
        if (timeout) clearTimeout(timeout);
        callback("Service "+serviceUUID+" not found");        
      }
    });  
  }
}


Connection.prototype.close = function() { 
  if (this.device) {
    log(this.name+": Disconnecting.");
    try { 
      this.device.disconnect();       
      log(this.name+": Disconnected");
    } catch (e) { 
      log(this.name+": Disconnect error: "+e); 
    }
    this.device = undefined;
  }
  // remove from connection list
  var i = connections.indexOf(this);
  if (i>=0) connections.splice(i,1);
  // see if there's anything else in the queue
  serviceQueue();
};

Connection.prototype.setUsed = function() {
  this.secondsSinceUsed = 0;
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
      //log("wrote data: "+ JSON.stringify(data.toString())+ " " + data.length + " bytes");
      writeToCharacteristic(characteristic, message, callback);
    });
  } else if (callback) callback();
}

// Look up an existing connection
function findConnectedDevice(device) {
  var found;
  connections.forEach(function(connection) {
    if (connection.device && connection.device.address == device.address)
      found = connection;
  });
  return found;
}

// Look up an existing connection or make one
function getConnectedDevice(device, callback) {
  var found = findConnectedDevice(device);
  if (found) {
    found.setUsed();
    callback(null, found);
  } else {
    queue.push(function() {
      // by the time we get here we may already have connected!
      found = findConnectedDevice(device);
      if (found) {
        found.setUsed();
        callback(null, found);
      } else {
        new Connection(device, callback);
      }
    });
    serviceQueue();
  }
}

function serviceQueue() {
  if (!queue.length) {
    if (connections.length==0) // no open connections
      discovery.restartScan();
    return;
  }
  if (connections.length < MAX_CONNECTIONS) {
    var job = queue.shift();
    discovery.stopScan();
    setTimeout(job, 1000);  
  }
}

function setNotBusy() {
  isBusy = false;
  serviceQueue();
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------


/* Write to the given device */
exports.write = function(device, service, characteristic, data) {
  if (isBusy) {
    queue.push(function() { exports.write(device,service,characteristic,data); });
    return;
  }
  isBusy = true;
  getConnectedDevice(device, function(err, connection) {
    if (err) return setNotBusy();

    connection.getCharacteristic(util.uuid2noble(service), 
                                 util.uuid2noble(characteristic),
     function(err,char) {
       if (err) return setNotBusy();;
       writeToCharacteristic(char, util.obj2buf(data), function() {
           log(connection.name+": Written.");
           setNotBusy();
         });
     });
  });
};

/* Read from the given device */
exports.read = function(device, service, characteristic, callback) {
  if (isBusy) {
    queue.push(function() { exports.read(device,service,characteristic,callback); });
    return;
  }
  isBusy = true;
  getConnectedDevice(device, function(err, connection) {
    if (err) return;
    connection.getCharacteristic(util.uuid2noble(service), 
                                 util.uuid2noble(characteristic),
     function(err,char) {
       if (err) return setNotBusy();
       char.read(function(error, data) {
         log(connection.name+": Read.");
         if (callback) callback(data.toString());
         setNotBusy();
       });
     });
  });
};

/* Start notifications on the given device */
exports.notify = function(device, service, characteristic, callback) {
  if (isBusy) {
    queue.push(function() { exports.notify(device,service,characteristic,callback); });
    return;
  }
  isBusy = true;
  getConnectedDevice(device, function(err, connection) {
    if (err) return setNotBusy();
    var serviceUUID = util.uuid2noble(service);
    var characteristicUUID = util.uuid2noble(characteristic);
    connection.getCharacteristic(serviceUUID,characteristicUUID, 
     function(err,char) {
       if (err) return setNotBusy();
       if (connection.services[serviceUUID][characteristicUUID].notifyCallback) {
         connection.services[serviceUUID][characteristicUUID].notifyCallback = callback;
         return setNotBusy(); // notifications were already set up
       }       
       char.on('data', function (data) {
         //log(connection.name+": notification on "+data.toString());
         //new Uint8Array(data).buffer
         if (connection.services[serviceUUID][characteristicUUID].notifyCallback)            
           connection.services[serviceUUID][characteristicUUID].notifyCallback(data.toString());
       });
       char.subscribe(function() {
         connection.services[serviceUUID][characteristicUUID].notifyCallback = callback;
         log(connection.name+": startNotifications complete");
       });
       setNotBusy();
     });
  });
};

/* Just try and connect. Will reset the timeout counter as well */
exports.ping = function(device, callback) {
  if (isBusy) {
    queue.push(function() { exports.ping(device,callback); });
    return;
  }
  isBusy = true;
  getConnectedDevice(device, function(err, connection) {
    if (err) return setNotBusy(); 
    if (callback) callback(null);
    setNotBusy();
  });
};

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------


setInterval(function() {
  for (var i=0;i<connections.length;i++) {
    var connection = connections[i];
    connection.secondsSinceUsed++;
    if (connection.secondsSinceUsed > CONNECTION_TIMEOUT) {
      log(connection.name+": Disconnecting due to lack of use (after "+CONNECTION_TIMEOUT+" secs)");
      connection.close();
      i--; // connection automatically removes itself from list
    }
  } 
}, 1000);
