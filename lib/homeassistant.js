const mqtt        = require("./mqttclient");
const config      = require("./config");
const deviceTypes = {
  temp: {
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
  moisture: { // %
    unit_of_measurement: "%"
  },
  conductivity: { // µS/cm
    unit_of_measurement: "µS/cm"
  },
  rssi: {
    unit_of_measurement: "",
    device_class: "signal_strength"
  }
}

let discoverySend = {};

exports.configDiscovery = function (data, peripheral, serviceId) {
  let id   = peripheral.address;
  let uuid = peripheral.uuid;
  for (let key in data) {
    if (deviceTypes[key] !== undefined && !discoverySend[id + key]) {
      let configTopic = "homeassistant/sensor/" + uuid + "/" + key + "/config"
      let payload     = {
        ...deviceTypes[key],
        "state_topic": config.mqtt_prefix + "/json/" + id + "/" + serviceId,
        "value_template": "{{ value_json." + key + "}}",
        "json_attributes_topic": config.mqtt_prefix + "/json/" + id + "/" + serviceId,
        "name": id + "_" + key,
        "unique_id": id + "_" + serviceId + "_" + key,
        "device": {
          "identifiers": [id],
          "name": "-",
          "sw_version": "EspruinoHub 0.0.1",
          "model": "-",
          "manufacturer": "-"
        },
        "availability": [
          {
            "topic": config.mqtt_prefix + "/presence/" + id,
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
      discoverySend[id + key] = true;
    }
  }
}

mqtt.client.on("close", function () {
  discoverySend = {};
})
