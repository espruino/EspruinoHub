/* 
Automatically connects to EspruinoHub via MQTT over WebSockets and updates
graphs and guages using the EspruinoHub history. From then on, everything
updates in real-time.

Use as follows:

    <link href="tinydash.css" rel="stylesheet">
    <script src="tinydash.js"></script>
    <script src="tinydash_mqtt.js"></script>
    <script src="paho-mqtt.js"></script>
    <script>
      var mqtt_prefix = "/ble";
      var o = {
        l:TD.label({x:10,y:10,width:200,height:60,label:"My Stats"}),
        log:TD.log({x:220,y:10,width:400,height:200,label:"Connection Log",text:""}),
        tempgraph:TD.graph({
                x:220,y:580,width:400,height:170,label:"Temperature Graph",gridx:24*60*60000,gridy:5,
                xlabel : function(t) { return ((Date.now()-t)/(24*60*60000)).toFixed(1)+" days";},
                mqttTopic: mqtt_prefix + "/temp/f0:98:9e:6c:0c:2f", 
                mqttAge: 96 // 96 hours = 4 days
        }),
        mygauge:TD.gauge({x:10,y:80,width:200,height:200,label:"Temperature Gauge",value:"--",
                          min:0,max:100,name:"gauge",
                          mqttTopic:mqtt_prefix+"/temp/mydevice"},
        button:TD.button({x:10,y:500,width:200,height:100,label:":Light LED",value:0,
                          name:"button",
                          mqttTopic:mqtt_prefix+"/write/c0:03:88:c9:0d:ec/nus/nus_tx",mqttMessage:"LED1.set()\n"}),
      };
      for (var i in o) document.body.appendChild(o[i]);
      function log(msg) {
        o.log.log(msg);
      }
      TD.mqttConnect(o);
    <script>

TODO:

* Get 'current value' of gauge/value from EspruinoHub rather than waiting for an update

*/

// ----
var mqttTopicHandlers = {
};
// ----

function linkMQTT(id, obj) {
  var mqttTopic = obj.opts.mqttTopic;
  switch (obj.type) {
    case "value":
    case "gauge":
      TD.mqttAddTopicHandler(mqttTopic, true, function(topic, payload) {
        obj.setValue(payload);
      });
      break;
    case "button":
      var mqttMessage = obj.opts.mqttMessage; 
      if (mqttTopic && mqttMessage) {
        if (obj.opts.onchange) console.warn("mqttTopic, mqttMessage *and* onchange defined. Overwriting onchange");
        obj.opts.onchange = function() {
          TD.mqtt.publish(mqttTopic, mqttMessage);
        };
      }
      break;
    case "graph":
      var highres = true;
      var age = obj.opts.mqttAge||12;
      var interval = (age<24)?"minute":"tenminutes";
      TD.mqttAddTopicHandler("/hist/minute/"+mqttTopic, true, function(topic, payload) {
        if (obj.opts.data) {
          obj.opts.data[Date.now()] = parseFloat(payload);
          obj.draw();
        }
      });
      TD.mqttAddTopicHandler("/hist/response/"+id, false, function(topic, payload) {
        var id = topic.split("/")[3];
        log("Got history for "+id);
        var d = JSON.parse(payload);
        var gr = [];
        d.data.forEach(function(data,idx) {
          gr[parseInt(d.times[idx])] = parseFloat(data);
        });
        obj.setData(gr);
      });
      log("Requesting history for "+id+" ("+mqttTopic+")");
      TD.mqtt.publish("/hist/request/"+id, JSON.stringify({
        interval : interval,
        age : age,
        topic : mqttTopic
      }));
      break;
    case "log":
      TD.mqttAddTopicHandler(mqttTopic, true, function(topic, payload) {
        obj.log(payload);
      });
      break;
    default:
      log("Unhandled element type "+JSON.stringify(obj.type));
  }
};

/* Connects to MQTT using the same basic path that the page was
served from */
TD.mqttConnect = function(objects) {
  function log(msg) {
    console.log(msg);
    if (objects.log)
      objects.log.log(msg);
  }

  TD.mqtt = new Paho.MQTT.Client(
    location.hostname,
    parseInt(location.port||80),
    location.pathname.substr(0,location.pathname.lastIndexOf("/")+1),
     "clientId");

  TD.mqtt.onConnectionLost = function(responseObject) {
    if (responseObject.errorCode !== 0) {
      log("MQTT connection lost:"+responseObject.errorMessage);
    }
    // force reconnect
    setTimeout(function() {
      log("MQTT Reconnecting...");
      TD.mqtt.connect({onSuccess: onMQTTConnect});
    }, 1000);
  };
  TD.mqtt.onMessageArrived = function(message) {
    //log(""+message.destinationName+"  ->  "+JSON.stringify(message.payloadString));
    var topic = message.destinationName;
    if (mqttTopicHandlers[topic]) {
      var handler = mqttTopicHandlers[topic].handler;
      if (!mqttTopicHandlers[topic].repeat) {
        TD.mqtt.unsubscribe(mqttTopicHandlers[topic].topic);
        delete mqttTopicHandlers[topic];
      }
      handler(topic, message.payloadString);
    }
  };
  // Connect to MQTT
  log("MQTT Connecting...");
  function onMQTTConnect() {
    log("MQTT Connected.");
    for (var id in objects) {
      var obj = objects[id];
      if (obj.opts.mqttTopic)
        linkMQTT(id, obj);
    }
  }
  TD.mqtt.connect({onSuccess: onMQTTConnect});
};

TD.mqttAddTopicHandler = function(topic, repeat, handler) {
  mqttTopicHandlers[topic] = { topic:topic, repeat:repeat, handler:handler };
  log("MQTT Subscribe "+topic);
  TD.mqtt.subscribe(topic);
};
