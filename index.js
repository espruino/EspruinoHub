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
 *  Entrypoint
 * ----------------------------------------------------------------------------
 */

require("./lib/status.js").init(); // Enable Status reporting to console
require("./lib/config.js").init(); // Load configuration
require("./lib/service.js").init(); // Enable HTTP Proxy Service
require("./lib/discovery.js").init(); // Enable Advertising packet discovery
require("./lib/http.js").init(); // Enable HTTP server for status
require("./lib/history.js").init(); // Enable History/Logging
