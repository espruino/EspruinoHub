/*
TODO:

Keep connection open for 30 secs after first write
Queue subsequent requests (to avoid double-connect/etc)
Respond to /ble/read with /ble/characteristic
Handle over-size writes
Display log messages alongside device status
Don't broadcast data if it hasn't changed?
*/

var mqtt = require('mqtt')
var noble = require('noble');

require("./blePeripheral.js"); // Enable HTTP Proxy

var ATTRIBUTE_NAMES = {
 "1809" : "Temperature",
 "180a" : "Device Information",
 "180f" : "Battery Percentage",
 "181c" : "User Data",
 "fe9f" : "Eddystone",
 "6e400001b5a3f393e0a9e50e24dcca9e" : "nus",
 "6e400002b5a3f393e0a9e50e24dcca9e" : "nus_tx",
 "6e400003b5a3f393e0a9e50e24dcca9e" : "nus_rx",
};

var ATTRIBUTE_HANDLER = {
 "1809" : function(a) {
   return { temp : (a.length==2) ? (((a[1]<<8)+a[0])/100) : a[0] }
  }
};

/** If the device is listed here, we use the human readable name
when printing status and publishing on MQTT */
var KNOWN_DEVICES = {
  "c0:52:3f:50:42:c9" : "office",
  "fc:a6:c6:04:db:79" : "hall_down",
  "cf:71:de:4d:f8:48" : "hall_up"
};
// TODO: add this to config


var inRange = [];


function lookupAttribute(attr) {
  for (var i in ATTRIBUTE_NAMES)
    if (ATTRIBUTE_NAMES[i]==attr) return i;
  return attr;
}

noble.on('discover', function(peripheral) {
  var id = peripheral.address;

  if (id in KNOWN_DEVICES)
    id = KNOWN_DEVICES[id];

  var entered = !inRange[id];
//  console.log(JSON.stringify(peripheral.advertisement,null,2));

  if (entered) {
    inRange[id] = {
      id : id,
      address : peripheral.address,
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
  inRange[id].lastSeen = Date.now();
  inRange[id].rssi = peripheral.rssi;

  mqttSend("/ble/advertise/"+id, JSON.stringify(mqttData));
  mqttSend("/ble/advertise/"+id+"/rssi", JSON.stringify(peripheral.rssi));

  peripheral.advertisement.serviceData.forEach(function(d) {
    /* Don't keep sending the same old data on MQTT. Only send it if
    it's changed or >1 minute old. */
    if (inRange[id].data[d.uuid] &&
        inRange[id].data[d.uuid].payload == d.data &&
        inRange[id].data[d.uuid].time > Date.now()*60000)
     return;
            
    mqttSend("/ble/advertise/"+id+"/"+d.uuid, JSON.stringify(d.data));
    inRange[id].data[d.uuid] = { payload : d.data, time : Date.now() };
    if (d.uuid in ATTRIBUTE_HANDLER) {
      var v = ATTRIBUTE_HANDLER[d.uuid](d.data);
      for (var k in v) {
        mqttSend("/ble/advertise/"+id+"/"+k, JSON.stringify(v[k]));
        mqttSend("/ble/"+k+"/"+id, JSON.stringify(v[k]));
      }
    }
  });
});

  function str2buf(str) {
    var buf = new Buffer(str.length);
    for (var i = 0; i < buf.length; i++) {
      buf.writeUInt8(str.charCodeAt(i), i);
    }
    return buf;
  }

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
  client.subscribe("/ble/write/#");
});
 
client.on('message', function (topic, message) {
  console.log("MQTT>"+topic+" => "+message.toString())
  var path = topic.substr(1).split("/");
  if (path[0]=="ble" && path[1]=="write") {    
    var id = path[2].toLowerCase();
    if (inRange[id]) {
     var device = inRange[id].peripheral;
     var service = lookupAttribute(path[3].toLowerCase());
     var charc = lookupAttribute(path[4].toLowerCase());
     console.log("Service ",service);
     console.log("Characteristic ",charc);
     device.connect(function (error) {
       if (error) {
         console.log("BT> ERROR Connecting");
       }
       console.log("BT> Connected");
       device.discoverAllServicesAndCharacteristics(function(error, services, characteristics) {
         console.log("BT> Got characteristics");
         var characteristic;
         for (var i=0;i<characteristics.length;i++)
           if (characteristics[i].uuid==charc) 
             characteristic = characteristics[i];
         if (characteristic) {
           console.log("BT> Found characteristic");
	   var data = str2buf(message.toString());
	   // TODO: writing long strings
           characteristic.write(data, false, function() {
             console.log("BT> Disconnecting...");
             device.disconnect();
           });
         } else {
           console.log("BT> No characteristic found");
           console.log("BT> Disconnecting...");
           device.disconnect();
         }
       });
     });
    } else {
      console.log("Write to "+id+" but not in range");
    }
  }
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
      var v = p.data[j].payload;
      if (j in ATTRIBUTE_HANDLER) 
        v = ATTRIBUTE_HANDLER[j](v);

      console.log("  "+n+" => "+JSON.stringify(v));
    }
  }
}

// -----------------------------------------
setInterval(checkForPresence, 1000);
setInterval(dumpStatus, 1000);

