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
 * HTTP Proxy Service
 * https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.service.http_proxy.xml
 * ----------------------------------------------------------------------------
 */

var config = require("./config");

function log(x) {
  console.log("[HTTPProxy] " + x);
}

if (!config.http_proxy) {
  log("config.http_proxy=false, not enabling Bleno/Proxy");
  exports.init = function () {
  };
  return;
}

var bleno;
try {
  bleno = require("bleno");
} catch (e) {
  bleno = require("@abandonware/bleno");
}
var discovery = require("./discovery");

if (Buffer.from === undefined) // Oh, thanks Node.
  Buffer.from = function (x) {
    return new Buffer(x);
  }


var httpProxy = {
  whitelisted: false,
  uri: "",
  headers: "",
  body: "EMPTY"
};

var httpStatusCode = new bleno.Characteristic({ // org.bluetooth.characteristic.http_status_code
                                                // 16 bit status code + Data Status
  uuid: "2AB8",
  properties: ["notify"]
});

var httpProxyService = new bleno.PrimaryService({
  uuid: "1823",
  characteristics: [
    new bleno.Characteristic({ // org.bluetooth.characteristic.uri
      uuid: "2AB6",
      properties: ["write"],
      onWriteRequest: function (data, offset, withoutResponse, callback) {
        if (httpProxy.whitelisted) {
          httpProxy.uri = data.toString("utf8");
          log("URI -> " + httpProxy.uri);
        }
        callback(bleno.Characteristic.RESULT_SUCCESS);
      }
    }),
    new bleno.Characteristic({ // org.bluetooth.characteristic.http_headers
      uuid: "2AB7",
      properties: ["read", "write"],
      onReadRequest: function (offset, callback) {
        callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(httpProxy.headers, "utf8"));
      },
      onWriteRequest: function (data, offset, withoutResponse, callback) {
        if (httpProxy.whitelisted)
          httpProxy.headers = data.toString("utf8");
        callback(bleno.Characteristic.RESULT_SUCCESS);
      }
    }),
    new bleno.Characteristic({ // org.bluetooth.characteristic.http_entity_body
      uuid: "2AB9",
      properties: ["read", "write"],
      onReadRequest: function (offset, callback) {
        callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(httpProxy.body, "utf8"));
      },
      onWriteRequest: function (data, offset, withoutResponse, callback) {
        if (httpProxy.whitelisted)
          httpProxy.body = data.toString("utf8");
        callback(bleno.Characteristic.RESULT_SUCCESS);
      }
    }),
    new bleno.Characteristic({ // org.bluetooth.characteristic.http_control_point
      uuid: "2ABA",
      properties: ["write"],
      onWriteRequest: function (data, offset, withoutResponse, callback) {
        if (httpProxy.whitelisted)
          httpStateHandler(data.readUInt8(0));
        callback(bleno.Characteristic.RESULT_SUCCESS);
      }
    }),
    httpStatusCode,
    new bleno.Characteristic({ // org.bluetooth.characteristic.https_security
      uuid: "2ABB",
      properties: ["read"],
      onReadRequest: function (offset, callback) {
        callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from([0]));
      }
    })
  ]
});


HTTP_CONTROL = {
  GET: 1,	// HTTP GET Request	N/A	Initiates an HTTP GET Request.
  HEAD: 2,	//	HTTP HEAD Request	N/A	Initiates an HTTP HEAD Request.
  POST: 3,	//	HTTP POST Request	N/A	Initiates an HTTP POST Request.
  PUT: 4,	//	HTTP PUT Request	N/A	Initiates an HTTP PUT Request.
  DELETE: 5,	//	HTTP DELETE Request	N/A	Initiates an HTTP DELETE Request.
  SGET: 6,	//	HTTPS GET Request	N/A	Initiates an HTTPS GET Reques.t
  SHEAD: 7,	//	HTTPS HEAD Request	N/A	Initiates an HTTPS HEAD Request.
  SPOST: 8,	//	HTTPS POST Request	N/A	Initiates an HTTPS POST Request.
  SPUT: 9,	//	HTTPS PUT Request	N/A	Initiates an HTTPS PUT Request.
  SDELETE: 10,	//	HTTPS DELETE Request	N/A	Initiates an HTTPS DELETE Request.
  CANCEL: 11	//	HTTP Request Cancel	N/A	Terminates any executing HTTP Request from the HPS Client.
};

HTTP_DATA_STATUS_BIT = { // 3rd byte of http_status_code
  HEADERS_RECEIVED: 1, // Headers Received
  // 0	The response-header and entity-header fields were not received in the HTTP response or stored in the HTTP Headers characteristic.
  // 1	The response-header and entity-header fields were received in the HTTP response and stored in the HTTP Headers characteristic for the Client to read.
  HEADERS_TRUNCATED: 2,	// Headers Truncated
  // 0	Any received response-header and entity-header fields did not exceed 512 octets in length.
  // 1	The response-header and entity-header fields exceeded 512 octets in length and the first 512 octets were saved in the HTTP Headers characteristic.
  BODY_RECEIVED: 4, // Body Received
  // 0	The entity-body field was not received in the HTTP response or stored in the HTTP Entity Body characteristic.
  // 1	The entity-body field was received in the HTTP response and stored in the HTTP Entity Body characteristic for the Client to read.
  BODY_TRUNCATED: 8 // Body Truncated
  // 0	Any received entity-body field did not exceed 512 octets in length.
  // 1	The entity-body field exceeded 512 octets in length and the first 512 octets were saved in the HTTP Headers characteristic
};

function httpSetStatusCode(httpCode, httpStatus) {
  log("Status code => " + httpCode + " " + httpStatus, httpProxy.body);
  var data = new Buffer(3);
  data.writeUInt16LE(httpCode, 0);
  data.writeUInt8(httpStatus, 2);
  if (httpStatusCode.updateValueCallback)
    httpStatusCode.updateValueCallback(data);
}

function httpStateHandler(state) {
  log("State => " + state, httpProxy);
  var method, protocol;
  switch (state) {
    case HTTP_CONTROL.GET  :
      method   = "GET";
      protocol = "http:";
      break;
    case HTTP_CONTROL.HEAD :
      method   = "HEAD";
      protocol = "http:";
      break;
    case HTTP_CONTROL.POST :
      method   = "POST";
      protocol = "http:";
      break;
    case HTTP_CONTROL.PUT  :
      method   = "PUT";
      protocol = "http:";
      break;
    case HTTP_CONTROL.DELETE :
      method   = "DELETE";
      protocol = "https:";
      break;
    case HTTP_CONTROL.SGET  :
      method   = "GET";
      protocol = "https:";
      break;
    case HTTP_CONTROL.SHEAD :
      method   = "HEAD";
      protocol = "https:";
      break;
    case HTTP_CONTROL.SPOST :
      method   = "POST";
      protocol = "https:";
      break;
    case HTTP_CONTROL.SPUT  :
      method   = "PUT";
      protocol = "https:";
      break;
    case HTTP_CONTROL.SDELETE :
      method   = "DELETE";
      protocol = "https:";
      break;
  }

  if (method && protocol) {
    var options    = require("url").parse(protocol + "//" + httpProxy.uri);
    options.method = method;

    var handler = (protocol == "https:") ? require("https") : require("http");
    var req     = handler.request(options, function (res) {
      httpProxy.headers = "";
      Object.keys(res.headers).forEach(function (k) {
        httpProxy.headers += k + ": " + res.headers[k] + "\r\n";
      });
      httpSetStatusCode(res.statusCode, HTTP_DATA_STATUS_BIT.HEADERS_RECEIVED);
      httpProxy.body = "";
      res.on("data", function (d) {
        httpProxy.body += d.toString();
      });
      res.on("end", function () {
        httpSetStatusCode(res.statusCode, HTTP_DATA_STATUS_BIT.HEADERS_RECEIVED | HTTP_DATA_STATUS_BIT.BODY_RECEIVED);
      });
    });
    req.on("error", function (e) {
      log("Problem with request: " + e.message);
    });
    req.end();
  }
}

function onStateChange(state) {
  log("Bleno State " + state);
  if (state == "poweredOn") {
    bleno.startAdvertising("EspruinoHub", ["1823"], onAdvertisingStart);
  }
}

function onAdvertisingStart(error) {
  log("Bleno.startAdvertising " + (error ? error : "Success"));
  if (!error) {
    bleno.setServices([httpProxyService], function (error) {
      log("Bleno.setServices " + (error ? error : "Success"));
    });
  }
}

/// When connection accepted
function onAccept(address) {
  address         = address.toLowerCase();
  var whitelisted = config.http_proxy &&
    config.http_whitelist.indexOf(address) >= 0;
  log(address + " connected (whitelisted: " + whitelisted + ")");
  // Reset state on each new connection
  httpProxy = {
    whitelisted: whitelisted,
    uri: "",
    headers: whitelisted ? "" : "BLOCKED",
    body: whitelisted ? "" : "BLOCKED"
  }
}

function onDisconnect() {
  log("Disconnected");
  discovery.startScan();
}

exports.init = function () {
  bleno.on("stateChange", onStateChange);
  bleno.on("accept", onAccept);
  bleno.on("disconnect", onDisconnect);
}
