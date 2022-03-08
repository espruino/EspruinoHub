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
var DEBUG = false;//true;

var util      = require("./util");
var discovery = require("./discovery");
var config    = require("./config");
var queue     = [];

var connections = [];
var isBusy      = false;
var busyTimeout = 0;
/* characteristic.write/getservices may fail if disconnect happens during it. If so
we should call it ourself when the device closes. */
var jobInProgress;

function log(x) {
  console.log("[Connect] " + x);
}

function Connection(device, callback) {
  var connection = this;

  connection.secondsSinceUsed = 0;
  connection.device           = device;
  connection.name             = device.address;
  connection.services         = {};
  connection.isOpen           = true;
  connections.push(this);

  log(connection.name + ": Connecting...");
  device.connect(function (error) {
    if (error) {
      log(connection.name + ": Error Connecting: " + error.toString());
      connection.device = undefined;
      connection.close();
      callback("Error Connecting: " + error.toString());
    } else {
      log("Connected.");
      device.once("disconnect", () => {
        log(connection.name + ": Disconnected by device");
        connection.device = undefined;
        connection.close();
        if (jobInProgress) {
          jobInProgress("DISCONNECTED");
          jobInProgress = undefined;
        }
        if (!queue.length && !connections.length) // no open connections
          discovery.startScan();
      });
      callback(null, connection);
    }
  });
}

Connection.prototype.getCharacteristic = function (serviceUUID, characteristicUUID, callback) {
  var connection = this;

  function getCharacteristicFromService(matchedService) {
    // do explicit search for known characteristic
    matchedService.discoverCharacteristics([characteristicUUID], function (error, characteristics) {
      if (error) {
        callback(error);
      }
      if (timeout) clearTimeout(timeout);
      if (characteristics != undefined && characteristics.length) {
        var matchedCharacteristic                            = characteristics[0];
        connection.services[serviceUUID][characteristicUUID] = {
          characteristic: matchedCharacteristic,
          notifyCallback: undefined
        };
        log(connection.name + ": found characteristic: " + matchedCharacteristic.uuid);
        callback(null, matchedCharacteristic);
      } else {
        callback("Characteristic " + characteristicUUID + " not found");
      }
    });
  }

  // look in cache
  if (connection.services[serviceUUID] &&
    connection.services[serviceUUID][characteristicUUID])
    return callback(null, connection.services[serviceUUID][characteristicUUID].characteristic);

  log(connection.name + ": Getting Service...");
  var timeout = setTimeout(function () {
    timeout = undefined;
    log(connection.name + ": Timed out getting services.");
    callback("Timed out getting services for characteristic.");
  }, 4000);

  var called = false;
  if (connection.services[serviceUUID]) {
    getCharacteristicFromService(connection.services[serviceUUID].service);
  } else {
    this.device.discoverServices([serviceUUID], function (error, services) { // do explicit search for known service
      if (called) return; // double callbacks for some reason?
      called = true;
      if (services != undefined && services.length) {
        var matchedService = services[0];
        log(connection.name + ": found service: " + matchedService.uuid, "getting Characteristic....");
        if (!connection.services[serviceUUID])
          connection.services[serviceUUID] = {service: matchedService};
        getCharacteristicFromService(matchedService);
      } else {
        if (timeout) clearTimeout(timeout);
        callback("Service " + serviceUUID + " not found");
      }
    });
  }
}

Connection.prototype.getServices = function (callback) {
  var connection = this;

  function handleService(allServices, index) {
    matchedService = allServices[index]
    log(connection.name + ": found service: " + matchedService.uuid, "getting Characteristic....");
    if (!connection.services[matchedService.uuid]) {
      connection.services[matchedService.uuid] = matchedService;
    }

    matchedService.discoverCharacteristics(null, function (error, characteristics) { // do search for all characteristics
      if (!error) {
        if (timeout) clearTimeout(timeout);
        if (characteristics != undefined && characteristics.length) {
          characteristics.forEach(function (matchedCharacteristic) {
            connection.services[matchedService.uuid][matchedCharacteristic.uuid] = {
              characteristic: matchedCharacteristic,
              notifyCallback: undefined
            };
            log(connection.name + ": found characteristic: " + matchedCharacteristic.uuid);
          });
        }
        if (index < allServices.length - 1) { // Last service in array?
          handleService(allServices, index + 1) // Handle next service
        } else {
          callback(null, connection.services) // Return connection's services
        }
      } else {
        callback("Failed to discover characteristics")
      }
    });
  }

  // don't look in cache

  log(connection.name + ": Getting Services...");
  var timeout = setTimeout(function () {
    timeout = undefined;
    log(connection.name + ": Timed out getting services.");
    callback("Timed out getting services.");
  }, 4000);


  this.device.discoverServices(null, function (error, services) { // do search for all services
    if (!error) {

      if (services != undefined && services.length) {
        handleService(services, 0)
      } else {
        callback(null, {})
      }
    } else {
      callback("Failed to discover services");
    }
  });
}

Connection.prototype.close = function () {
  if (!this.isOpen) return;
  this.isOpen = false;
  if (this.device) {
    log(this.name + ": Disconnecting.");
    try {
      this.device.disconnect();
      log(this.name + ": Disconnected");
    } catch (e) {
      log(this.name + ": Disconnect error: " + e);
    }
    this.device = undefined;
  }
  // remove from connection list
  var i = connections.indexOf(this);
  if (i >= 0) connections.splice(i, 1);
  log("Connections remaining: " + JSON.stringify(connections.map(c => c.name)));
  // we'll just wait for the next idle to see if there's anything else in the queue
};

Connection.prototype.setUsed = function () {
  this.secondsSinceUsed = 0;
};

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

// Repeated write to characteristic
function writeToCharacteristic(characteristic, message, callback) { // added function to write longer strings
  if (message.length) {
    var data      = message.slice(0, 20);
    message       = message.slice(20);
    jobInProgress = callback; // in case characteristic.write fails from disconnect
    characteristic.write(data, false, function () {
      jobInProgress = undefined;
      //log("wrote data: "+ JSON.stringify(data.toString())+ " " + data.length + " bytes");
      writeToCharacteristic(characteristic, message, callback);
    });
  } else if (callback) callback();
}

// Utility getCharacteristic fn that always calls callback
function getCharacteristic(connection, service, characteristic, callback) {
  jobInProgress = callback; // in case getCharacteristic fails from disconnect
  connection.getCharacteristic(util.uuid2noble(service),
    util.uuid2noble(characteristic),
    function (err, char) {
      jobInProgress = undefined;
      callback(err, char);
    });
}

// Look up an existing connection
function findConnectedDevice(device) {
  var found;
  connections.forEach(function (connection) {
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
    discovery.stopScan();
    setTimeout(() => { new Connection(device,callback)},1000 );
  }
}

function serviceQueue() {
  if (isBusy) return;
  if (queue.length)
    log("serviceQueue jobs " + queue.length);
  if (!queue.length) {
    if (connections.length == 0) // no open connections
      discovery.startScan();
    return;
  }
  if (connections.length < config.max_connections) {
    var job = queue.shift();
    discovery.stopScan();
    console.log("Starting job from Queue");
    setTimeout(job, 100);
  }
}

function getStack() {
  var err = new Error();
  Error.captureStackTrace(err, getStack);
  var s = err.stack.toString().trim();
  if (s.startsWith("Error"))
    s = s.substr(5).trim();
  return s;
}

function setNotBusy(dontService) {
  //log("SET NOT BUSY " + getStack());
  isBusy      = false;
  busyTimeout = 0;
  if (!dontService)
    serviceQueue();
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------


/* Write to the given device */
exports.write = function (device, service, characteristic, data, callback) {
  if (isBusy) {
    queue.push(function () {
      exports.write(device, service, characteristic, data);
    });
    return;
  }
  if (DEBUG) log("> write to " + device);
  isBusy = true;
  getConnectedDevice(device, function (err, connection) {
    if (err) return setNotBusy();
    getCharacteristic(connection, service, characteristic, function (err, char) {
      if (err) return setNotBusy();
      var dataBuf = util.obj2buf(data);
      writeToCharacteristic(char, dataBuf, function (err) {
        if (err) log(connection.name + ": Error " + err + " during write.");
        else log(connection.name + ": Written " + dataBuf.length + " bytes");
        setNotBusy(err);
        if (callback) callback();
      });
    });
  });
};

/* Read from the given device */
exports.read = function (device, service, characteristic, callback) {
  if (isBusy) {
    queue.push(function () {
      exports.read(device, service, characteristic, callback);
    });
    return;
  }
  if (DEBUG) log("> read from " + device);
  isBusy = true;
  getConnectedDevice(device, function (err, connection) {
    if (err) return;
    getCharacteristic(connection, service, characteristic, function (err, char) {
      if (err) return setNotBusy();
      char.read(function (err, data) {
        if (err) log(connection.name + ": Error " + err + " during read.");
        else log(connection.name + ": Read.");
        if (callback) callback(data.toString());
        setNotBusy(err);
      });
    });
  });
};

/* Read services from the given device */
exports.readServices = function (device, callback) {
  if (isBusy) {
    queue.push(function () {
      exports.readServices(device, callback);
    });
    return;
  }
  if (DEBUG) log("> readServices on " + device);
  isBusy = true;
  getConnectedDevice(device, function (err, connection) {
    if (err) {
      return;
    }
    connection.getServices(function (err, services) {
      if (err) {
        return setNotBusy();
      }
      /* Extract UUIDs from the connection's services object.
         Output array format:
         [
           {
             uuid:serviceUuid,
             characteristics: [
               {
                 uuid:characteristicUuid
               }
             ]
           }
         ]
      */
      var output = []
      for (service in services) {
        var item = {
          uuid: service,
          characteristics: []
        }
        for (uuid in services[service].characteristics) {
          let c = services[service].characteristics[uuid];
          if (c.hasOwnProperty("uuid")) {
            item.characteristics.push({uuid: c.uuid, properties: c.properties, name: c.name, type: c.type})
          }
        }
        output.push(item)
      }
      // Stringifies array before sending
      callback(JSON.stringify(output))
      setNotBusy();
    });
  });
};

/* Start notifications on the given device. callback(String) */
exports.notify = function (device, service, characteristic, callback) {
  if (isBusy) {
    queue.push(function () {
      exports.notify(device, service, characteristic, callback);
    });
    return;
  }
  if (DEBUG) log("> notify for " + device);
  isBusy = true;
  getConnectedDevice(device, function (err, connection) {
    //if (DEBUG) log("> notify 1 "+(err||"success")+isBusy);
    if (err) return setNotBusy(err);

    getCharacteristic(connection, service, characteristic, function (err, char) {
      //if (DEBUG) log("> notify 2 "+(err||"success")+isBusy);
      if (err) return setNotBusy(err);
      var serviceUUID        = util.uuid2noble(service);
      var characteristicUUID = util.uuid2noble(characteristic);

      if (connection.services[serviceUUID][characteristicUUID].notifyCallback) {
        if (DEBUG) log("> notifications already set up");
        connection.services[serviceUUID][characteristicUUID].notifyCallback = callback;
        return setNotBusy(); // notifications were already set up
      }
      char.on("data", function (data) {
        if (DEBUG) log(connection.name + ": notification on " + JSON.stringify(data.toString("binary")));
        if (connection.services[serviceUUID][characteristicUUID].notifyCallback)
          connection.services[serviceUUID][characteristicUUID].notifyCallback(data.toString("binary"));
        connection.setUsed(); // Reset 'secondsSinceUsed' on notifyCallback triggered.
      });
      char.subscribe(function (err) {
        //if (DEBUG) log("> notify 3 "+(err||"success")+isBusy);
        connection.services[serviceUUID][characteristicUUID].notifyCallback = callback;
        log(connection.name + ": startNotifications complete");
        setNotBusy();
      });
    });
  });
};

/* Just try and connect. Will reset the timeout counter as well */
exports.ping = function (device, callback) {
  if (isBusy) {
    queue.push(function () {
      exports.ping(device, callback);
    });
    return;
  }
  if (DEBUG) log("> ping " + device);
  isBusy = true;
  getConnectedDevice(device, function (err, connection) {
    if (err) return setNotBusy();
    if (callback) callback(null);
    setNotBusy();
  });
};

/* Get a line of status info to display on screen */
exports.getStatusText = function () {
  return "[CONNECT] Connections [" + connections.map(c => c.name) + "] " + (isBusy ? "BUSY" : "IDLE");
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------


setInterval(function () {
  if (isBusy) {
    busyTimeout++;
    if (busyTimeout > 10) {
      log("TIMEOUT! Busy for >10 secs, ignoring");
      isBusy = false;
    }
  }
  for (var i = 0; i < connections.length; i++) {
    var connection = connections[i];
    connection.secondsSinceUsed++;
    if (connection.secondsSinceUsed > config.connection_timeout) {
      log(connection.name + ": Disconnecting due to lack of use (after " + config.connection_timeout + " secs)");
      connection.close();
      i--; // connection automatically removes itself from list
    }
  }
}, 1000);
