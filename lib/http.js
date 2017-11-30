// HTTP server
var PORT=1888;
var webSocketServer = require('websocket').server;
var http = require("http");
var status = require("./status");


function log(x) {
  console.log("<HTTO> "+x);
}

function pageHandler(req, res) {
  res.writeHead(200, {"Content-Type": "text/html"});
  res.write('<!DOCTYPE "html"><html><head>');
  res.write('<meta http-equiv="refresh" content="2">');
  res.write('<title>EspruinoHub Status</title>');
  res.write('</head><body><pre>');
  res.write(status.getStatusText());
  res.write('</pre></body>');
  res.write('</html>');
  res.end();
}

exports.init = function() {
  var server = http.createServer(pageHandler);
  server.listen(PORT);
  log("Server is listening on "+PORT);
  /* Start the WebSocket relay - allows standard Websocket MQTT communications */
  var wsServer = new webSocketServer({
    httpServer: server,
    autoAcceptConnections: false
  });
  wsServer.on('request', function(request) {
    if (request.requestedProtocols[0] != "mqttv3.1" &&
        request.requestedProtocols[0] != "mqtt") {
      request.reject();
      log("Rejected non-mqtt websocket");
      return;
    }
    var wsconnection = request.accept(request.requestedProtocols[0], request.origin);
    log((new Date()) + ' Connection accepted.');
    var socket = new require("net").Socket();

    socket.connect(1883, "localhost", function() {
      log("Websocket MQTT connected");
    });
    socket.on('data', function(d) {
      wsconnection.sendBytes(d);
    });
    socket.on('close', function() {
      log("Websocket MQTT closed");
      wsconnection.close();
    });

    wsconnection.on('message', function(message) {
      if (message.type === 'binary') {
        socket.write(message.binaryData);
      }
    });
    wsconnection.on('close', function(reasonCode, description) {    
      log("Websocket closed");
      socket.end();
    });
  });
}
