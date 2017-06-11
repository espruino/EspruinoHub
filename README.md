ble-bridge (for Hassbian)
===========

A BLE -> MQTT bridge for Raspberry Pi and other Embedded devices


Setting up
----------

# Install a modern version of nodejs and nodered
# Upgrade bluez 
# Install requirements
```
npm install
```
# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

Usage
-----

Run with `start.sh` (ideally you'd set this to auto-start - see below)

Useful MQTT parts are:

* `/ble/presence/DEVICE` - 1 or 0 depending on whether device has been seen or not
* `/ble/advertise/DEVICE/#` - JSON for device's broadcast name, rssi and manufacturer-specific data
