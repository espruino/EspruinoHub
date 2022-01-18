const mqtt          = require("./mqttclient");
const config        = require("./config");
const deviceTypes   = {
  temp: {
    unit_of_measurement: "°C",
    device_class: "temperature"
  },
  temperature: {
    unit_of_measurement: "°C",
    device_class: "temperature"
  },
  humidity: {
    unit_of_measurement: "%",
    device_class: "humidity"
  },
  pressure: { // pa
    unit_of_measurement: "hPa",
    device_class: "pressure"
  },
  steps: {
    unit_of_measurement: "steps",
    icon: "mdi:walk"
  },
  heartRate: {
    unit_of_measurement: "bpm",
    icon: "mdi:heart-pulse"
  },
  weight: {
    unit_of_measurement: "kg",
    icon: "mdi:scale-bathroom"
  },
  battery: {
    unit_of_measurement: "%",
    device_class: "battery"
  },
  illuminance: { // lx
    unit_of_measurement: "lx",
    device_class: "illuminance"
  },
  light: {
    device_class: "light"
  },
  moisture: { // %
    unit_of_measurement: "%",
    icon: "mdi:water-percent"
  },
  motion: {
    device_class: "motion",
    off_delay: 30
  },
  conductivity: { // µS/cm
    unit_of_measurement: "µS/cm",
    icon: "mdi:flower"
  },
  rssi: {
    unit_of_measurement: "dBm",
    device_class: "signal_strength"
  },
  digital: {},
  analog: {},
  level: {},
  alert: {},
  data: {}
}
const binaryDevices = ["digital", "motion", "light"];

let discoverySend = {};

function joinKey(arr) {
  return arr.join("_").replace("/", "");
}

exports.configDiscovery = function (data, device, peripheral, serviceId) {
  let id   = peripheral.address;
  let uuid = peripheral.uuid;
  for (let dataKey in data) {
    if (deviceTypes[dataKey] !== undefined && !discoverySend[id + serviceId + dataKey]) {
      let component, valueTemplate;
      if (binaryDevices.includes(dataKey)) {
        component     = "binary_sensor";
        valueTemplate = "{{ \"ON\" if float(value_json." + dataKey + ")!=0 else \"OFF\" }}";
      } else {
        component     = "sensor";
        valueTemplate = "{{ value_json." + dataKey + "}}";
      }
      let configTopic = `homeassistant/${component}/${uuid}/${serviceId}_${dataKey}/config`
      let payload     = {
        ...deviceTypes[dataKey],
        "state_topic": device.json_state_topic + "/" + serviceId,
        "value_template": valueTemplate,
        "json_attributes_topic": device.json_state_topic + "/" + serviceId,
        "name": joinKey([uuid, serviceId, dataKey]),
        "unique_id": joinKey([config.mqtt_prefix, uuid, serviceId, dataKey]),
        "device": {
          "identifiers": [id],
          "name": id,
          "sw_version": "EspruinoHub 0.0.1",
          "model": "-",
          "manufacturer": "-"
        },
        "availability": [
          {
            "topic": device.presence_topic,
            "payload_available": "1",
            "payload_not_available": "0"
          },
          {
            "topic": config.mqtt_prefix + "/state"
          }
        ]
      };
      if (config.mqtt_options.clientId) {
        payload.unique_id += "_" + config.mqtt_options.clientId;
        payload.name += "_" + config.mqtt_options.clientId;
        payload.device.identifiers[0] += "_" + config.mqtt_options.clientId;
      }
      if (peripheral.advertisement.localName) {
        payload.device.name = peripheral.advertisement.localName;
      }
      if (data["productName"]) {
        payload.device.model        = data["productName"];
        payload.device.manufacturer = "Xiaomi";
      }

      mqtt.send(configTopic, JSON.stringify(payload), {retain: true});
      discoverySend[id + serviceId + dataKey] = true;
    }
  }
}

mqtt.client.on("close", function () {
  discoverySend = {};
})
