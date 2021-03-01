// HTTP server
var webSocketServer = require("websocket").server;
var http            = require("http");
var config          = require("./config");
var status          = require("./status");
var discovery       = require("./discovery");

var pathToWWW;

function log(x) {
  console.log("[HTTP] " + x);
}

function pageHandlerStatus(req, res) {
  res.writeHead(200, {"Content-Type": "text/html"});
  res.write("<!DOCTYPE \"html\"><html><head>");
  res.write("<meta http-equiv=\"refresh\" content=\"2\">");
  res.write("<title>EspruinoHub Status</title>");
  res.write("</head><body>");
  res.write("<pre>");
  res.write(status.getStatusText());
  res.write("</pre></body>");
  res.write("</html>");
  res.end();
}

function resolvePath(base, url) {
  var path = require("path").resolve(base, "./" + url);
  if (path.substr(0, base.length) != base) {
    log("Hacking attempt? ", url);
    res.writeHead(404);
    res.end();
    return;
  }
  log("Serving " + path);
  return path;
}

function handleMIME(path, res) {
  var mime;
  if (path.substr(-4) == ".css") mime = "text/css";
  if (path.substr(-5) == ".html") mime = "text/html";
  if (path.substr(-4) == ".png") mime = "image/png";
  if (path.substr(-4) == ".js") mime = "text/javascript";
  if (mime) res.setHeader("Content-Type", mime);
}

function pageHandlerWWW(req, res) {
  if (!pathToWWW) return false; // no WWW
  var url = require("url").parse(req.url).pathname;
  if (url == "/") url = "/index.html";
  if (url.substr(0, 4) == "/ide") {
    if (url !== "/ide") {
      res.writeHead(302, {
        location: "/ide"
      });
      res.end();
      return true;
    }
    url = "/ide.html";
  }
  // load filesystem file
  var path = resolvePath(pathToWWW, url);
  if (!path) return true;
  if (require("fs").existsSync(path)) {
    //console.log("Serving file ",path);
    require("fs").readFile(path, function (err, blob) {
      handleMIME(path, res);
      res.writeHead(200);
      res.end(blob);
    });
    return true;
  }
  return false;
}

function pageHandler(req, res) {
  var url = req.url.toString();
  if ((url == "/" && !pathToWWW) ||
    (url == "/status")) {
    pageHandlerStatus(req, res);
  } else if (!pageHandlerWWW(req, res)) {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.end("404: Page " + url + " not found");
  }
}

// WebSocket to MQTT forwarder
function mqttWebSocket(request) {
  if (request.requestedProtocols[0] != "mqttv3.1" &&
    request.requestedProtocols[0] != "mqtt") return false;

  var wsconnection = request.accept(request.requestedProtocols[0], request.origin);
  log((new Date()) + " Connection accepted.");
  var socket = new require("net").Socket();

  var mqttServer = require("url").parse(config.mqtt_host);
  if (!mqttServer.port)
    mqttServer.port = (mqttServer.protocol == "mqtts:") ? 8883 : 1883;

  socket.connect(mqttServer.port, mqttServer.hostname, function () {
    log("Websocket MQTT connected");
  });
  socket.on("data", function (d) {
    wsconnection.sendBytes(d);
  });
  socket.on("close", function () {
    log("Websocket MQTT closed (MQTT)");
    wsconnection.close();
  });
  socket.on("error", function (msg) {
    log("Websocket MQTT error: " + msg);
    wsconnection.close();
  });

  wsconnection.on("message", function (message) {
    if (message.type === "binary") {
      socket.write(message.binaryData);
    }
  });
  wsconnection.on("close", function (reasonCode, description) {
    log("Websocket MQTT closed (WebSocket)");
    socket.end();
  });
  return true;
}

exports.init = function () {
  var httpPort = config.http_port;
  if (!httpPort) {
    log("No http_port in config. Not enabling web server");
    return;
  }

  var server = http.createServer(pageHandler);
  server.listen(httpPort);
  log("Server is listening on http://localhost:" + httpPort);
  /* Start the WebSocket relay - allows standard Websocket MQTT communications */
  var wsServer = new webSocketServer({
    httpServer: server,
    autoAcceptConnections: false
  });
  wsServer.on("request", function (request) {
    if (mqttWebSocket(request)) return;
    request.reject();
    log("Rejected unknown websocket type " + request.requestedProtocols[0]);
  });

  // Handle WWW dir serving
  pathToWWW = require("path").resolve(__dirname, "../www");
  if (require("fs").existsSync(pathToWWW)) {
    log("www directory found at " + pathToWWW + ". Web server at http://localhost:" + httpPort);
  } else {
    log("www directory not found. Not serving.");
    pathToWWW = undefined;
  }
}
