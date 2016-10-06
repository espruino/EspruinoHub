var mqtt = require('mqtt')
var noble = require('noble');

var inRange = [];

noble.on('discover', function(peripheral) {
  var id = peripheral.id;
  var entered = !inRange[id];
//  console.log(JSON.stringify(peripheral.advertisement,null,2));

  if (entered) {
    inRange[id] = {
      peripheral: peripheral
    };
    mqttSend("/presence/ble", peripheral.address);
  }
  var mqttData = {
    rssi: peripheral.rssi,
  };
  if (peripheral.advertisement.localName)
    mqttData.name = peripheral.advertisement.localName;
  mqttSend("/ble/"+peripheral.address, JSON.stringify(mqttData));

  peripheral.advertisement.serviceData.forEach(function(d) {
    mqttSend("/ble/"+peripheral.address+"/"+d.uuid, JSON.stringify(d.data));
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


/*

{
  "localName": "Espruino NRF52832DK",
  "serviceData": [
    {
      "uuid": "180f",
      "data": [
        95
      ]
    }
  ],
  "serviceUuids": [
    "6e400001b5a3f393e0a9e50e24dcca9e"
  ],
  "solicitationServiceUuids": [],
  "serviceSolicitationUuids": []
}


{ _noble: 
   { state: 'poweredOn',
     address: 'b8:27:eb:ed:60:4b',
     _bindings: 
      { _state: 'poweredOn',
        _addresses: [Object],
        _addresseTypes: [Object],
        _connectable: [Object],
        _pendingConnectionUuid: null,
        _connectionQueue: [],
        _handles: {},
        _gatts: {},
        _aclStreams: {},
        _hci: [Object],
        _gap: [Object],
        _events: [Object],
        onSigIntBinded: [Function],
        _scanServiceUuids: [] },
     _peripherals: { f3ec654485db: [Object], f2fce799045f: [Circular] },
     _services: { f3ec654485db: {}, f2fce799045f: {} },
     _characteristics: { f3ec654485db: {}, f2fce799045f: {} },
     _descriptors: { f3ec654485db: {}, f2fce799045f: {} },
     _discoveredPeripheralUUids: [ 'f3ec654485db', 'f2fce799045f' ],
     _events: 
      { warning: [Function],
        discover: [Function],
        stateChange: [Function] },
     _allowDuplicates: undefined },
  id: 'f2fce799045f',
  uuid: 'f2fce799045f',
  address: 'f2:fc:e7:99:04:5f',
  addressType: 'random',
  connectable: true,
  advertisement: 
   { localName: 'EST',
     txPowerLevel: undefined,
     manufacturerData: <Buffer 4c 00 02 15 b9 40 7f 30 f5 f8 46 6e af f9 25 55 6b 57 fe 6d 04 5f e7 99 b6>,
     serviceData: [ [Object] ],
     serviceUuids: [ '180f' ],
     solicitationServiceUuids: [],
     serviceSolicitationUuids: [] },
  rssi: -91,
  services: null,
  state: 'disconnected' }

*/
