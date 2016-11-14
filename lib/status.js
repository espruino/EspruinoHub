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
 * Writes the current status to the console
 * ----------------------------------------------------------------------------
 */

var attributes = require('./attributes');

var logHistory = [];


 function dumpStatus() {
   var inRange = require("./discovery.js").inRange;
   // clear screen
   console._log('\033c');
   //process.stdout.write('\x1B[2J\x1B[0f');
   // ...
   console._log(logHistory.join("\n")+"\n");

   console._log("Scanning... "+(new Date()).toString());
   console._log();
   // sort by most recent
   var arr = [];
   for (var id in inRange)
     arr.push(inRange[id]);
   //arr.sort(function(a,b) { return a.rssi - b.rssi; });
   arr.sort(function(a,b) { return a.id.localeCompare(b.id); });
   // output
   var amt = 3;
   var maxAmt = process.stdout.getWindowSize()[1];
   for (var i in arr) {
     var p = arr[i];
     if (++amt > maxAmt) { console.log("..."); return; }
     console._log(p.id+" - "+p.name+" (RSSI "+p.rssi+")");
     for (var j in p.data) {
       if (++amt > maxAmt) { console.log("..."); return; }
       var n = attributes.getReadableAttributeName(j);
       var v = p.data[j].payload;
       console._log("  "+n+" => "+JSON.stringify(attributes.decodeAttribute(n,v)));
     }
   }
 }

 // -----------------------------------------

exports.init = function() {
  console._log = console.log;
  /** Replace existing console.log with something that'll let us
  report status alongside evrything else */
  console.log = function() {
    var args = Array.from(arguments);
    if (logHistory.length>5)
      logHistory = logHistory.slice(-5);
    logHistory.push(args.join("\t"));
    dumpStatus();
  };

  setInterval(dumpStatus, 1000);
};
