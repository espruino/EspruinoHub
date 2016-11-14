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


Run with `start.sh`


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
