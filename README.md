EspruinoHub
===========

A BLE -> MQTT bridge for Raspberry Pi and other Embedded devices


Setting up
----------

Assuming a blank Pi:

```
# Get node, npm, node-red, etc
sudo apt-get install node npm mosquitto mosquitto-clients nodered bluetooth bluez libbluetooth-dev libudev-dev
# Install node-red service
sudo systemctl enable nodered.service
# Install the node-red UI
cd .node-red && sudo npm install node-red-contrib-ui

# As it comes, NPM on the Pi is broken
# and doesn't like installing native libs. Update NPM
sudo npm -g install npm node-gyp

# Now get this repository
git clone https://github.com/espruino/EspruinoHub
# Install its' requirements
cd EspruinoHub
npm install

# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

Usage
-----

Run with `start.sh` (ideally you'd set this to auto-start)

You can then access Node-red using `http://localhost:1880`

Once you add UI elements and click `Deploy` they'll be visible at `http://localhost:1880/ui`

The easiest way to get data is to add an MQTT listener node that requests
`/ble/advertise/#` (`#` is a wildcard). This will output all information received
via advertising.

Useful MQTT parts are:

* `/ble/presence/DEVICE` - 1 or 0 depending on whether device has been seen or not
* `/ble/advertise/DEVICE` - JSON for device's broadcast name and rssi
* `/ble/advertise/DEVICE/rssi` - Device signal strength
* `/ble/advertise/DEVICE/SERVICE` - Raw service data (as JSON)
* `/ble/advertise/DEVICE/PRETTY` or `/ble/PRETTY/DEVICE` - Decoded service data. `temp` is the obvious one


Testing MQTT
------------

```
# listen to all, verbose
mosquitto_sub -h localhost -t /# -v

# Test publish
mosquitto_pub -h localhost -t test/topic -m "Hello world"
```


Note
----

To allow Bluetooth to advertise services (for the HTTP proxy) you need:

```
# Stop the bluetooth service
sudo service bluetooth stop
# Start Bluetooth but without bluetoothd
sudo hciconfig hci0 up
```

See https://github.com/sandeepmistry/bleno



TODO
----

* Keep connection open in `connect.js` for 30 secs after first write
* Re-use the connection for queues requests
* Handle over-size writes
