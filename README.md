EspruinoHub
===========

A BLE -> MQTT bridge for Raspberry Pi and other Embedded devices


Setting up
----------

Assuming a blank Pi:

```
# Install a modern version of nodejs and nodered
sudo apt-get install build-essential python-rpi.gpio
bash <(curl -sL https://raw.githubusercontent.com/node-red/raspbian-deb-package/master/resources/update-nodejs-and-nodered)
# Get dependencies
sudo apt-get install mosquitto mosquitto-clients bluetooth bluez libbluetooth-dev libudev-dev

# Auto start Node-RED
sudo systemctl enable nodered.service
# Start nodered manually this one time (this creates ~/.node-red)
sudo systemctl start nodered.service
# Install the Node-RED UI
cd ~/.node-red && npm install node-red-contrib-ui
# Now get this repository
cd ~/
git clone https://github.com/espruino/EspruinoHub
# Install its' requirements
cd EspruinoHub
npm install

# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

**Note:** On non-Raspberry Pi devices, Mosquitto (the MQTT server) may default to not allowing anonymous (un-authenticated) connections to MQTT. To fix this edit `/etc/mosquitto/conf.d/local.conf` and set `allow_anonymous` to `true`.


Usage
-----

Run with `start.sh` (ideally you'd set this to auto-start - see below)

You can then access Node-RED using `http://localhost:1880`

Once you add UI elements and click `Deploy` they'll be visible at `http://localhost:1880/ui`

The easiest way to get data is to add an MQTT listener node that requests
`/ble/advertise/#` (`#` is a wildcard). This will output all information received
via advertising.

Useful MQTT advertising parts are:

* `/ble/presence/DEVICE` - 1 or 0 depending on whether device has been seen or not
* `/ble/advertise/DEVICE` - JSON for device's broadcast name, rssi and manufacturer-specific data
* `/ble/advertise/DEVICE/manufacturer/COMPANY` - Manufacturer-specific data (without leading company code)
* `/ble/advertise/DEVICE/rssi` - Device signal strength
* `/ble/advertise/DEVICE/SERVICE` - Raw service data (as JSON)
* `/ble/advertise/DEVICE/PRETTY` or `/ble/PRETTY/DEVICE` - Decoded service data. `temp` is the obvious one

To decode the hex-encoded manufacturer-specific data, try:
```
var data = Buffer.from(msg.payload.manufacturerData, 'hex');
```

You can also connect to a device:

* `/ble/write/DEVICE/SERVICE/CHARACTERISTIC` connects and writes to the charactertistic
* `/ble/read/DEVICE/SERVICE/CHARACTERISTIC` connects and reads from the charactertistic
* `/ble/notify/DEVICE/SERVICE/CHARACTERISTIC` connects and starts notifications on the characteristic
* `/ble/ping/DEVICE` connects, or maintains a connection to the device, and sends `/ble/pong/DEVICE` on success

After connecting, EspruinoHub will stay connected for a few seconds unless there is
any activity (eg a `write` or `ping`). So you can for instance evaluate something
on a Puck.js BLE UART connection with:

```
=> /ble/notify/c7:f9:36:dd:b0:ca/nus/nus_rx
"\x10E.getTemperature()\n" => /ble/write/c7:f9:36:dd:b0:ca/nus/nus_tx
```


Auto Start
----------

There are a few ways to get services running all the time on a Raspberry Pi, but
as it's got a video output it's nice to be able to use that as a status display.

To do this:

* Edit `.bashrc` and add the following right at the bottom:

```
if [ $(tty) == /dev/tty1 ]; then
  while true; do
    EspruinoHub/start.sh
    sleep 1s
  done
fi
```

* Now run `sudo raspi-config`, choose `Boot Options`, `Desktop / CLI`, and `Console Autologin`

* Next time you reboot, the console will automatically run `EspruinoHub`

Alternatively, you can configure it as a system start-up job using `systemd`:
```
    sudo cp systemd-EspruinoHub.service /etc/systemd/system/EspruinoHub.service
```
and edit it as necessary to match your installation directory and user configuration.  Then, to start it for testing:
```
    sudo systemctl start EspruinoHub.service && sudo journalctl -f -u EspruinoHub
```
If it works, enable it to start on login:
```
    sudo systemctl enable EspruinoHub.service
```


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


Troubleshooting
---------------

### When using the HTTP Proxy I get `BLOCKED` returned in the HTTP body

Your BLE device isn't in the whitelist in `config.json` - because the HTTP Proxy
exposes your internet connection to the world, only BLE devices with the addresses
you have specified beforehand are allowed to connect.


TODO
----

* Keep connection open in `connect.js` for 30 secs after first write
* Re-use the connection for queued requests
* Handle over-size writes
