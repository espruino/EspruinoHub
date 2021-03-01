var config = require("./config");
var fs     = require("fs");

var pathToLog;
var historyTopics = [];

function log(x) {
  console.log("[History] " + x);
}

// =============================================================================
function getLogFileForDate(timespec, date) {
  if (!pathToLog) return;
  return pathToLog + "/" + timespec + "-" + date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
}

function logWrite(timespec, topic, data) {
  if (!pathToLog) return;
  //log(" [LOG]"+timespec+" "+topic+" "+data);
  var file = getLogFileForDate(timespec, new Date());
  fs.appendFileSync(file, Date.now() + " " + topic + " " + data + "\n");
};

function logReadTopic(interval, from, to, topic, callback) {
  var fromTime = from.getTime();
  var toTime   = to.getTime();
  var time     = fromTime;
  if (from.getFullYear() < 2018 ||
    toTime > Date.now() + 1000 * 60 * 60 * 24) return; // invalid date range
  var files = [];
  while (time <= toTime) {
    var file = getLogFileForDate(interval, new Date(time));
    if (fs.existsSync(file)) files.push(file);
    time += 1000 * 60 * 60 * 24; // one day
  }

  function readFiles(result, callback) {
    if (!files.length) return callback(result);
    var file = files.shift(); // take first file off
    const rl = require("readline").createInterface({
      input: fs.createReadStream(file),
      crlfDelay: Infinity
    });
    rl.on("line", (line) => {
      var topicIdx = line.indexOf(" ");
      var dataIdx  = line.indexOf(" ", topicIdx + 1);
      var lTopic   = line.substring(topicIdx + 1, dataIdx);
      if (lTopic == topic) {
        try {
          var t = parseInt(line.substr(0, topicIdx));
          var d = JSON.parse(line.substr(dataIdx + 1));
          if (t >= fromTime && t <= toTime) {
            result.times.push(t);
            result.data.push(d);
          }
        } catch (e) {
          log("Unable to parse log file, " + e.toString());
        }
      }
    });
    rl.on("close", (line) => {
      readFiles(result, callback);
    });
  }

  readFiles({
    interval: interval,
    from: from.getTime(),
    to: to.getTime(),
    topic: topic,
    times: [],
    data: []
  }, function (result) {
    callback(result);
  });
};

// =============================================================================
function onMQTTMessage(topic, message) {
  var msg = message.toString();
  if (topic.indexOf(" ") >= 0) {
    log("Topic ignored due to whitespace: " + topic);
    return; // ignore topics with spaces
  }
  if (topic.startsWith(config.history_path)) {
    handleCommand(topic, msg);
  } else {
    handleData(topic, msg);
  }
}

function handleData(topic, message) {
  var data = parseFloat(message);
  if (!isNaN(data)) {
    //log("MQTT>"+topic+" => "+data);
    if (topic in historyTopics) {
      historyTopics[topic].pushNumber(data);
    } else {
      historyTopics[topic] = new HistoryTopic(topic);
      historyTopics[topic].pushNumber(data);
    }
  }
}

function handleCommand(topic, message) {
  var cmdRequest = config.history_path + "request/";
  //log("MQTT Command>"+topic+" => "+JSON.stringify(message));
  if (topic.startsWith(cmdRequest)) {
    /*
      interval : "minute",
      //use age : 1, // hour
      //or  from : "1 July 2018", to : "5 July 2018" (or anything that works in new Date(...))
      topic : config.mqtt_prefix+"/advertise/..."
    */
    var json;
    try {
      json = JSON.parse(message);
    } catch (e) {
      log("MQTT " + cmdRequest + " malformed JSON " + JSON.stringify(message));
      return;
    }
    var tag = topic.substr(cmdRequest.length);
    log("REQUEST " + tag + " " + JSON.stringify(json));
    // TODO: Validate request
    if (!json.topic) {
      log("MQTT " + cmdRequest + " no topic");
      return;
    }
    if (!(json.interval in config.history_times)) {
      log("MQTT " + cmdRequest + " invalid interval");
      return;
    }
    var dFrom, dTo;
    if (json.from)
      dFrom = new Date(json.from);
    if (json.age)
      dFrom = new Date(Date.now() - parseFloat(json.age * 1000 * 60 * 60));
    if (json.to)
      dTo = new Date(json.to);
    else
      dTo = new Date();
    if (!dFrom || isNaN(dFrom.getTime()) ||
      !dTo || isNaN(dTo.getTime())) {
      log("MQTT " + cmdRequest + " invalid from/to or age");
      return;
    }
    //log("HISTORY "+dFrom+" -> "+dTo);
    logReadTopic(json.interval, dFrom, dTo, json.topic, function (data) {
      log("RESPONSE " + tag + " (" + data.data.length + " items)");
      require("./mqttclient.js").send(config.history_path + "response/" + tag, JSON.stringify(data));
    });
  }
}

// =============================================================================
function HistoryTopic(topic) {
  log("New History Topic for " + topic);
  this.topic = topic;
  this.times = {};
  for (var i in config.history_times)
    this.times[i] = {num: 0, sum: 0, time: 0};
}

HistoryTopic.prototype.pushNumber = function (n) {
  //log.write("all",this.topic,n);
  for (var i in config.history_times) {
    this.times[i].num++;
    this.times[i].sum += n;
  }
};

HistoryTopic.prototype.tick = function (time) {
  for (var period in config.history_times) {
    var t = this.times[period];
    t.time += time;
    if (t.time > config.history_times[period]) {
      if (t.num) {
        var avr = t.sum / t.num;
        logWrite(period, this.topic, avr);
        require("./mqttclient.js").send(config.history_path + period + this.topic, "" + avr);
      }
      this.times[period] = {num: 0, sum: 0, time: 0};
    }
  }
};

// =============================================================================
exports.init = function () {
  if (config.history_path == "") {
    log("history_path value is empty, thus not providing history.");
  } else {
    var mqtt = require("./mqttclient.js").client;
    // Link in to messages
    mqtt.on("connect", function () {
      // Subscribe to any BLE data
      mqtt.subscribe(config.mqtt_prefix + "/#");
      // Subscribe to history requests
      mqtt.subscribe(config.history_path + "#");
    });
    mqtt.on("message", onMQTTMessage);
    // Check all history topics and write to log if needed
    // TODO: could be just do this when we receive our data?
    setInterval(function () {
      Object.keys(historyTopics).forEach(function (el) {
        historyTopics[el].tick(1000);
      });
    }, 1000);

    // Handle log dir serving
    pathToLog = require("path").resolve(__dirname, "../log");
    if (require("fs").existsSync(pathToLog)) {
      log("log directory found at " + pathToLog + ". Enabling logging.");
    } else {
      log("log directory not found. Not logging.");
      pathToLog = undefined;
    }
  }
}
