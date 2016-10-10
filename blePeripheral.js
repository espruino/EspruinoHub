// BLE peripheral that handles MQTT and HTTP

var bleno = require('bleno');


// https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.service.http_proxy.xml

var httpProxy = {
  uri : "",
  headers : "",
  body : ""
};

var httpStatusCode = new bleno.Characteristic({ // org.bluetooth.characteristic.http_status_code
  // 16 bit status code + Data Status
  uuid: '2AB8',
  properties: ['notify'],
  value: Buffer.from([0,0,0]]),
});

var httpProxyService = new bleno.PrimaryService({
    uuid: '1823',
    characteristics: [
      new bleno.Characteristic({ // org.bluetooth.characteristic.uri
        uuid: '2AB6',
        properties: ['write'],
        onWriteRequest : function(data, offset, withoutResponse, callback) { httpProxy.uri = data.toString('utf8'); callback(bleno.Characteristic.RESULT_SUCCESS); }
      }),
      new bleno.Characteristic({ // org.bluetooth.characteristic.http_headers
        uuid: '2AB7',
        properties: ['read','write'],
        onReadRequest : function(offset, callback) { callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(httpProxy.headers, "utf8")); },
        onWriteRequest : function(data, offset, withoutResponse, callback) { httpProxy.headers = data.toString('utf8'); callback(bleno.Characteristic.RESULT_SUCCESS); }
      }),
      new bleno.Characteristic({ // org.bluetooth.characteristic.http_entity_body
        uuid: '2AB9',
        properties: ['read','write'],
        onReadRequest : function(offset, callback) { callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from(httpProxy.body, "utf8")); },
        onWriteRequest : function(data, offset, withoutResponse, callback) { httpProxy.body = data.toString('utf8'); callback(bleno.Characteristic.RESULT_SUCCESS); }
      }),
      new bleno.Characteristic({ // org.bluetooth.characteristic.http_control_point
        uuid: '2ABA',
        properties: ['write'],        
        onWriteRequest : function(data, offset, withoutResponse, callback) { httpStateHandler(data.readUInt8(0)); callback(bleno.Characteristic.RESULT_SUCCESS); }
      }),
      httpStatusCode,
      new bleno.Characteristic({ // org.bluetooth.characteristic.https_security
        uuid: '2ABB',
        properties: ['read'],
        onReadRequest : function(offset, callback) { callback(bleno.Characteristic.RESULT_SUCCESS, Buffer.from([0])); }
      })
    ]
});


HTTP_CONTROL = {
  GET     : 1,	// HTTP GET Request	N/A	Initiates an HTTP GET Request.
  HEAD    : 2,	//	HTTP HEAD Request	N/A	Initiates an HTTP HEAD Request.
  PORT    : 3,	//	HTTP POST Request	N/A	Initiates an HTTP POST Request.
  PUT     : 4,	//	HTTP PUT Request	N/A	Initiates an HTTP PUT Request.
  DELETE  : 5,	//	HTTP DELETE Request	N/A	Initiates an HTTP DELETE Request.
  SGET    : 6,	//	HTTPS GET Request	N/A	Initiates an HTTPS GET Reques.t
  SHEAD   : 7,	//	HTTPS HEAD Request	N/A	Initiates an HTTPS HEAD Request.
  SPOST   : 8,	//	HTTPS POST Request	N/A	Initiates an HTTPS POST Request.
  SPUT    : 9,	//	HTTPS PUT Request	N/A	Initiates an HTTPS PUT Request.
  SDELETE : 10,	//	HTTPS DELETE Request	N/A	Initiates an HTTPS DELETE Request.
  CANCEL  : 11,	//	HTTP Request Cancel	N/A	Terminates any executing HTTP Request from the HPS Client.
};

HTTP_DATA_STATUS_BIT = { // 3rd byte of http_status_code
  HEADERS_RECIEVED :1, // Headers Received
  // 0	The response-header and entity-header fields were not received in the HTTP response or stored in the HTTP Headers characteristic.
  // 1	The response-header and entity-header fields were received in the HTTP response and stored in the HTTP Headers characteristic for the Client to read.
  HEADERS_TRUNCATED : 2,	// Headers Truncated
  // 0	Any received response-header and entity-header fields did not exceed 512 octets in length.
  // 1	The response-header and entity-header fields exceeded 512 octets in length and the first 512 octets were saved in the HTTP Headers characteristic.
  BODY_RECIEVED	: 4, // Body Received
  // 0	The entity-body field was not received in the HTTP response or stored in the HTTP Entity Body characteristic.
  // 1	The entity-body field was received in the HTTP response and stored in the HTTP Entity Body characteristic for the Client to read.
  BODY_TRUNCATED : 8, // Body Truncated
  // 0	Any received entity-body field did not exceed 512 octets in length.
  // 1	The entity-body field exceeded 512 octets in length and the first 512 octets were saved in the HTTP Headers characteristic
};

function httpStateHandler(state) {
  console.log("[HTTP PROXY] State => "+state);
}

bleno.on('stateChange', function(state) {
  console.log("[BLENO] State "+state);
  if (state == "poweredOn") {
    bleno.startAdvertising("PuckHub", ['1823'], function (error) {
      console.log("startAdvertising " + error);
    });
    bleno.setServices(httpProxyService, function (error) {
      console.log("setServices " + error);
    });
  }
});
