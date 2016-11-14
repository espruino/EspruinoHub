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

exports.str2buf = function(str) {
  var buf = new Buffer(str.length);
  for (var i = 0; i < buf.length; i++) {
    buf.writeUInt8(str.charCodeAt(i), i);
  }
  return buf;
}
