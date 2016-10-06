var mqtt = require('mqtt')
var noble = require('noble');

var ATTRIBUTE_NAMES = {
 "1809" : "Temperature",
 "180a" : "Device Information",
 "180f" : "Battery Percentage",
 "181c" : "User Data",
 "fe9f" : "Eddystone"
};

var inRange = [];

noble.on('discover', function(peripheral) {
  var id = peripheral.address;
  var entered = !inRange[id];
//  console.log(JSON.stringify(peripheral.advertisement,null,2));

  if (entered) {
    inRange[id] = {
      id : id,
      peripheral: peripheral,
      name : "?",
      data : {}
    };
    mqttSend("/presence/ble/"+id, "1");
  }
  var mqttData = {
    rssi: peripheral.rssi,
  };
  if (peripheral.advertisement.localName) {
    mqttData.name = peripheral.advertisement.localName;
    inRange[id].name = peripheral.advertisement.localName;
  }
  mqttSend("/ble/"+peripheral.address, JSON.stringify(mqttData));

  peripheral.advertisement.serviceData.forEach(function(d) {
    mqttSend("/ble/"+peripheral.address+"/"+d.uuid, JSON.stringify(d.data));
    inRange[id].data[d.uuid] = d.data;
  });

  inRange[id].lastSeen = Date.now();
  inRange[id].rssi = peripheral.rssi;
});

noble.on('stateChange',  function(state) {
  if (state!="poweredOn") return;
  noble.startScanning([], true);
  console.log("Started...");
});

var client  = mqtt.connect('mqtt://localhost');
var mqttConnected = false;
 
client.on('connect', function () {
  console.log("MQTT Connected");
  mqttConnected = true;
//  client.publish('presence', 'Hello mqtt')
});
 
client.on('message', function (topic, message) {
  console.log("MQTT>"+topic+" => "+message.toString())
  // client.end();
});

function mqttSend(topic, message) {
  if (mqttConnected) client.publish(topic, message);
}

function checkForPresence() {
  var timeout = Date.now() - 60*1000; // 60 seconds
  Object.keys(inRange).forEach(function(id) {
    if (inRange[id].lastSeen < timeout) {
      mqttSend("/presence/ble/"+id, "0");
      delete inRange[id];
    }
  });
}

setInterval(checkForPresence, 1000);
setInterval(dumpStatus, 1000);

function dumpStatus() {
  // clear screen
  console.log('\033c');
  //process.stdout.write('\x1B[2J\x1B[0f');
  // ...
  console.log("Scanning... "+(new Date()).toString());
  console.log();
  // sort by most recent
  var arr = [];
  for (var id in inRange)
    arr.push(inRange[id]);
  arr.sort(function(a,b) { return a.rssi - b.rssi; });    
  // output
  var amt = 3;
  var maxAmt = process.stdout.getWindowSize()[1];
  for (var i in arr) {
    var p = arr[i];
    if (++amt > maxAmt) { console.log("..."); return; }
    console.log(p.id+" - "+p.name+" (RSSI "+p.rssi+")");
    for (var j in p.data) {
      if (++amt > maxAmt) { console.log("..."); return; }
      var n = ATTRIBUTE_NAMES[j] ? ATTRIBUTE_NAMES[j] : j;
      console.log("  "+n+" => "+JSON.stringify(p.data[j]));
    }
  }
}

