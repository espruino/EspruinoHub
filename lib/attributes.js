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

var config        = require("./config");
const util        = require("./util");
const miParser    = require("./parsers/xiaomi").Parser;
const qingping    = require("./parsers/qingping").Parser;
const {ParserAtc} = require("./parsers/atc");

exports.names = {
  // https://www.bluetooth.com/specifications/gatt/services/
  "1801": "Generic Attribute",
  "1809": "Temperature",
  "180a": "Device Information",
  "180f": "Battery Service",
  // https://github.com/atc1441/ATC_MiThermometer#advertising-format-of-the-custom-firmware
  "181a": "ATC_MiThermometer",
  "181b": "Body Composition",
  "181c": "User Data",
  "181d": "Weight Scale",
  // https://www.bluetooth.com/specifications/gatt/characteristics/
  "2a2b": "Current Time",
  "2a6d": "Pressure",
  "2a6e": "Temperature",
  "2a6f": "Humidity",
  // https://www.bluetooth.com/specifications/assigned-numbers/16-bit-uuids-for-members/
  "fe0f": "Philips",
  "fe95": "Xiaomi",
  "fe9f": "Google",
  "feaa": "Google Eddystone",

  "6e400001b5a3f393e0a9e50e24dcca9e": "nus",
  "6e400002b5a3f393e0a9e50e24dcca9e": "nus_tx",
  "6e400003b5a3f393e0a9e50e24dcca9e": "nus_rx"
};

exports.handlers = {
  "1809": function (a) { // Temperature
    var t = (a.length == 2) ? (((a[1] << 8) + a[0]) / 100) : a[0];
    if (t >= 128) t -= 256;
    return {temp: t}
  },
  "180f": function (a) { // Battery percent
    return {
      battery: a[0]
    }
  },
  "181a": function (a, device) { // ATC_MiThermometer
    try {
      return new ParserAtc(a, device).parse();
    } catch (e) {
      return {error: e.message, raw: a.toString("hex")};
    }
  },
  "181b": function (a) { // Xiaomi V2 Scale
    let unit;
    let weight = a.readUInt16LE(a.length - 2) / 100;
    if ((a[0] & (1 << 4)) !== 0) { // Chinese Catty
      unit = "jin";
    } else if ((a[0] & 0x0F) === 0x03) { // Imperial pound
      unit = "lbs";
    } else if ((a[0] & 0x0F) === 0x02) { // MKS kg
      unit   = "kg";
      weight = weight / 2;
    } else {
      unit = "???"
    }
    const state = {
      isStabilized: ((a[1] & (1 << 5)) !== 0),
      loadRemoved: ((a[1] & (1 << 7)) !== 0),
      impedanceMeasured: ((a[1] & (1 << 1)) !== 0)
    };

    const measurements = {
      weight: util.toFixedFloat(weight, 2),
      unit,
      impedance: a.readUInt16LE(a.length - 4)
    };
    return {...measurements, ...state};
  },
  "181d": function (a) { // Xiaomi V1 Scale
    let unit;
    let weight = a.readUInt16LE(1) * 0.01;
    // status byte:
    //- Bit 0: lbs unit
    //- Bit 1-3: unknown
    //- Bit 4: jin unit
    //- Bit 5: stabilized
    //- Bit 6: unknown
    //- Bit 7: weight removed
    let status = [];
    for (let i = 0; i <= 7; i++) {
      status.push(a[0] & (1 << i) ? 1 : 0)
    }

    if (status[0] === 1) {
      unit = "lbs";
    } else if (status[4] === 1) {
      unit = "jin";
    } else {
      unit   = "kg";
      weight = weight / 2;
    }

    const state = {
      isStabilized: (status[5] !== 0),
      loadRemoved: (status[7] !== 0)
    };

    const d  = {
      year: a.readUInt16LE(3),
      month: a.readUInt8(5),
      day: a.readUInt8(6),
      hour: a.readUInt8(7),
      minute: a.readUInt8(8),
      second: a.readUInt8(9)
    }
    let date = new Date(d.year, d.month - 1, d.day, d.hour, d.minute, d.second);
    return {weight: util.toFixedFloat(weight, 2), unit, ...state, date};
  },
  "fdcd": function(d) {
    try {
      return new qingping(d).parse();
    } catch (e) {
      return {error: e.message, raw: d.toString("hex")};
    }
  },
  "fff9": function(d) {
    try {
      return new qingping(d).parse();
    } catch (e) {
      return {error: e.message, raw: d.toString("hex")};
    }
  },
  "fe95": function (d, device) {
    try {
      const r = new miParser(d, device ? device.bind_key : null).parse();
      return {...r.event, productName: r.productName};
    } catch (e) {
      return {error: e.message, raw: d.toString("hex")};
    }
  },
  "fee0": function (d) {
    let r = {steps: (0xff & d[0] | (0xff & d[1]) << 8)};
    if (d.length === 5)
      r.heartRate = d[4];
    return r;
  },
  "feaa": function (d) { // Eddystone
    if (d[0] == 0x10) { // URL
      var rssi = d[1];
      if (rssi & 128) rssi -= 256; // signed number
      var urlType   = d[2];
      var URL_TYPES = [
        "http://www.",
        "https://www.",
        "http://",
        "https://"];
      var url       = URL_TYPES[urlType] || "";
      for (var i = 3; i < d.length; i++)
        url += String.fromCharCode(d[i]);
      return {url: url, "rssi@1m": rssi};
    }
  },
  "2a6d": function (a) { // Pressure in pa
    return {pressure: ((a[1] << 24) + (a[1] << 16) + (a[1] << 8) + a[0]) / 10}
  },
  "2a6e": function (a) { // Temperature in C
    var t = ((a[1] << 8) + a[0]) / 100;
    if (t >= 128) t -= 256;
    return {temp: t}
  },
  "2a6f": function (a) { // Humidity
    return {humidity: ((a[1] << 8) + a[0]) / 100}
  },
  "2a06": function (a) { // org.bluetooth.characteristic.alert_level
    // probably not meant for advertising, but seems useful!
    return {alert: a[0]}
  },
  "2a56": function (a) { // org.bluetooth.characteristic.digital
    // probably not meant for advertising, but seems useful!
    return {digital: a[0] != 0}
  },
  "2a58": function (a) { // org.bluetooth.characteristic.analog
    // probably not meant for advertising, but seems useful!
    return {analog: a[0] | (a.length > 1 ? (a[1] << 8) : 0)}
  },
  // org.bluetooth.characteristic.digital_output	0x2A57 ?
  "ffff": function (a) { // 0xffff isn't standard anything - just transmit it as 'data'
    if (a.length == 1)
      return {data: a[0]};
    return {data: Array.prototype.slice.call(a, 0).join(",")}
  }
};

exports.getReadableAttributeName = function (attr) {
  for (var i in exports.names)
    if (exports.names[i] == attr) return i;
  return attr;
};

exports.decodeAttribute = function (name, value, device) {
  if (!(name in config.exclude_services)) { // @todo per device
    // built-in decoders
    if (name in exports.handlers) {
      var r = exports.handlers[name](value, device);
      return r ? r : value;
    }

    // use generic decoder for known services
    if (name in exports.names) {
      var obj                  = {};
      obj[exports.names[name]] = value;
      return obj;
    }

    // look up decoders in config.json
    if (name in config.advertised_services) {
      var srv       = config.advertised_services[name];
      var obj       = {};
      obj[srv.name] = value[0];
      return obj;
    }
  }
  // otherwise as-is
  return value;
};

exports.lookup = function (attr) {
  for (var i in exports.names)
    if (exports.names[i] == attr) return i;
  return attr;
};
