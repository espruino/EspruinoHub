var config = require("./config");

const defaultSettings = {
  "min_rssi": config.min_rssi,
  "presence_timeout": config.presence_timeout,
  "connection_timeout": config.connection_timeout,
  "exclude_attributes": config.exclude_attributes,
  "cache_state": config.mqtt_cache_state,
  "bind_key": null
}

const devices = {};
exports.list  = devices;

function createDevice(mac, name = "", settings) {
  mac = mac.toLowerCase();
  if (name === "") name = mac;
  let device = {mac, name, ...defaultSettings, ...settings};

  device.json_state_topic = config.mqtt_prefix + "/json/" + device.name;
  device.presence_topic   = config.mqtt_prefix + "/presence/" + device.name;
  device.advertise_topic  = config.mqtt_prefix + "/advertise/" + device.name;

  device.state            = {};
  device.getOrSetState    = function (key, state) {
    if (device.state[key] !== undefined) {
      state = {...device.state[key], ...state};
    }
    return device.state[key] = state;
  }
  device.filterAttributes = function (decoded) {
    device.exclude_attributes.map(function (a) {
      if (decoded.hasOwnProperty(a)) delete decoded[a];
    })
  }
  return device;
}

exports.known = function (mac, s) {
  mac        = mac.toLowerCase();
  let device = {};
  if (typeof s === "string") {
    device = createDevice(mac, s);
  } else if (typeof s === "object") {
    device = createDevice(mac, s.name, s);
  }
  device.known = true;
  devices[mac] = device;
}

exports.getByMac = function (mac) {
  mac = mac.toLowerCase();
  if (!(mac in devices)) {
    devices[mac] = createDevice(mac, mac);
  }
  return devices[mac];
}

exports.getByName = function (name) {
  let found;
  Object.keys(devices).forEach(function (k) {
    if (devices[k].name === name)
      found = devices[k];
  });
  return found;
}

exports.deviceToAddr = function (id) {
  let addr   = id.toLowerCase();
  let device = exports.getByName(id);
  if (device !== undefined) {
    addr = device.mac;
  }
  return addr;
}

