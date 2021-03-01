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
 *  Utilities
 * ----------------------------------------------------------------------------
 */

exports.str2buf = function (str) {
  var buf = new Buffer(str.length);
  for (var i = 0; i < buf.length; i++) {
    buf.writeUInt8(str.charCodeAt(i), i);
  }
  return buf;
};

exports.obj2buf = function (o) {
  if ((typeof o) == "object" && (typeof o.type) === "string") {
    switch (o.type) {
      case "Buffer":
      case "buffer":
        return new Buffer(o.data);
      case "hex":
        return Buffer.from(o.data, "hex");
    }
  }

  if ((typeof o) == "number" || (typeof o) == "boolean") {
    let buf = new Buffer(1);
    buf.writeUInt8(0 | o, 0);
    return buf;
  }

  // if it's not a string or array, convert to JSON and send that
  if (!((typeof o) == "string" || Array.isArray(o))) {
    return exports.obj2buf(JSON.stringify(o));
  }

  let buf = new Buffer(o.length);
  for (var i = 0; i < buf.length; i++) {
    if ("string" == typeof o)
      buf.writeUInt8(o.charCodeAt(i), i);
    else
      buf.writeUInt8(o[i], i);
  }
  return buf;
};

exports.uuid2noble = function (c) {
  return c.replace(/-/g, "");
};

exports.toFixedFloat = function (num, digits) {
  return parseFloat(num.toFixed(digits));
}
