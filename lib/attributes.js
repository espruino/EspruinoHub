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
 *  Known Attributes and conversions for them
 * ----------------------------------------------------------------------------
 */

var config = require('./config');

exports.names = {
 "1809" : "Temperature",
 "180a" : "Device Information",
 "180f" : "Battery Percentage",
 "181c" : "User Data",
 "fe95" : "MJ_HT_V1",
 "feaa" : "Eddystone",
 "2a6e" : "Temperature",
 "2a6f" : "Humidity",
 "2a6d" : "Pressure",
 "6e400001b5a3f393e0a9e50e24dcca9e" : "nus",
 "6e400002b5a3f393e0a9e50e24dcca9e" : "nus_tx",
 "6e400003b5a3f393e0a9e50e24dcca9e" : "nus_rx",
};

exports.handlers = {
 "1809" : function(a) { // Temperature
   var t = (a.length==2) ? (((a[1]<<8)+a[0])/100) : a[0];
   if (t>=128) t-=256; 
   return { temp : t }
  },
 "180f" : function(a) { // Battery percent
   return {
     battery : a[0]
   }
  },
 "fe95" : function(d) { // MJ_HT_V1 (aka Xiaomi Mija LYWSDCGQ/01ZM)
   var r = {};
   // @see https://github.com/hannseman/homebridge-mi-hygrothermograph
   // @see https://github.com/LynxyssCZ/node-xiaomi-gap-parser
   if (d[11] == 0x04) {
     var temp = d[15] << 8 | d[14];
     if (temp & 0x8000) temp -= 0x10000;
     r.temp = temp / 10;
   } else if (d[11] == 0x06) {
     r.humidity = (d[15] << 8 | d[14]) / 10;
   } else if (d[11] == 0x0a) {
     r.battery = d[14];
   } else if (d[11] == 0x0d) {
     var temp = d[15] << 8 | d[14];
     if (temp & 0x8000) temp -= 0x10000;
     r.temp = temp / 10;
     r.humidity = (d[17] << 8 | d[16]) / 10;
   }
   return r;
 },
 "feaa" : function(d) { // Eddystone
   if (d[0]==0x10) { // URL
     var rssi = d[1];
     if (rssi&128) rssi-=256; // signed number
     var urlType = d[2];
     var URL_TYPES = [
        "http://www.",
        "https://www.",
        "http://",
        "https://"];
     var url = URL_TYPES[urlType] || "";
     for (var i=3;i<d.length;i++)
       url += String.fromCharCode(d[i]);
     return { url : url, "rssi@1m":rssi };
   }
  },
 "2a6d" : function(a) { // Pressure in pa
   return {  pressure : ((a[1]<<24)+(a[1]<<16)+(a[1]<<8)+a[0])/10 }
  },
 "2a6e" : function(a) { // Temperature in C
   var t = ((a[1]<<8)+a[0])/100;
   if (t>=128) t-=256;
   return {  temp : t }
  },
 "2a6f" : function(a) { // Humidity
   return {  humidity : ((a[1]<<8)+a[0])/100 }
  },
 "ffff" : function(a) { // 0xffff isn't standard anything - just transmit it as 'data'
    if (a.length==1)
      return { data : a[0] };
    return {  data : Array.prototype.slice.call(a, 0).join(",") }
   },
};

exports.getReadableAttributeName = function(attr) {
  for (var i in exports.names)
    if (exports.names[i]==attr) return i;
  return attr;
};

exports.decodeAttribute = function(name, value) {
  // built-in decoders
  if (name in exports.handlers) {
    var r = exports.handlers[name](value);
    return r?r:value;
  }
  // look up decoders in config.json
  if (name in config.advertised_services) {
    var srv = config.advertised_services[name];
    var obj = {};
    obj[srv.name] = value[0];
    return obj;
  }
  // otherwise as-is
  return value;
};

exports.lookup = function(attr) {
  for (var i in exports.names)
    if (exports.names[i]==attr) return i;
  return attr;
};
