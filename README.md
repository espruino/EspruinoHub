EspruinoHub
===========

A BLE -> MQTT bridge for Raspberry Pi and other Embedded devices for [Espruino](http://www.espruino.com/) and [Puck.js](http://www.puck-js.com/)

Setting up
----------

Ideally use a Raspberry Pi 3 or Zero W, as these have Bluetooth LE on them already. However the BLE USB dongles [mentioned in the Puck.js Quick Start guide](http://www.espruino.com/Puck.js+Quick+Start#requirements) should work.

### Get Raspbian running on your Raspberry Pi

* Download Raspbian Lite from https://www.raspberrypi.org/downloads/raspbian/
* Copy it to an SD card with `sudo dd if=2017-11-29-raspbian-stretch-lite.img of=/dev/sdc status=progress bs=1M` on Linux (or see the instructions on the Raspbian download page above for your platform)
* Unplug and re-plug the SD card and add a file called `ssh` to the `boot` drive - this will enable SSH access to the Pi
* If you're using WiFi rather than Ethernet, see [this post on setting up WiFi via the SD card](https://raspberrypi.stackexchange.com/questions/10251/prepare-sd-card-for-wifi-on-headless-pi)
* Now put the SD card in the Pi, apply power, and wait a minute
* `ssh pi@raspberrypi.local` (or use PuTTY on Windows) and use the password `raspberry`
* Run `sudo raspi-config` and set the Pi up as you want (eg. hostname, password)

### Installation of everything (EspruinoHub, Node-RED, Web IDE)

These instructions install up to date Node.js and Node-RED - however it can take a while! If you just want EspruinoHub and the IDE, see the next item.

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
# Now get EspruinoHub
cd ~/
git clone https://github.com/espruino/EspruinoHub
# Install EspruinoHub's required Node libraries
cd EspruinoHub
npm install
# Optional - enable gathering of historical data by creating a 'log' directory
mkdir log
# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

You can now type `./start.sh` to run EspruinoHub, but it's worth checking out the `Auto Start` section to see how to get it to run at boot.

### Installation of EspruinoHub and Web IDE

```
# Install Node, Bluetooth, etc
sudo apt-get update
sudo apt-get install git-core nodejs nodejs-legacy npm build-essential mosquitto mosquitto-clients bluetooth bluez libbluetooth-dev libudev-dev
# Now get EspruinoHub
git clone https://github.com/espruino/EspruinoHub
# Install EspruinoHub's required Node libraries
cd EspruinoHub
npm install
# Optional - enable gathering of historical data by creating a 'log' directory
mkdir log
# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

You can now type `./start.sh` to run EspruinoHub, but it's worth checking out the `Auto Start` section to see how to get it to run at boot.

### Auto Start

There are a 2 main ways to run EspruinoHub on the Raspberry Pi.

#### Headless Startup

This is the normal way of running services - to configure them as a system start-up job using `systemd`:**

```
    sudo cp systemd-EspruinoHub.service /etc/systemd/system/EspruinoHub.service
```

and edit it as necessary to match your installation directory and user configuration.  Then, to start it for testing:

```
    sudo systemctl start EspruinoHub.service && sudo journalctl -f -u EspruinoHub
```

If it works, Ctrl-C to break out and enable it to start on login:

```
    sudo systemctl enable EspruinoHub.service
```


#### Console Startup

If you have a video output on your Pi then you can run EspruinoHub at boot - on the main display - so that you can see what it's reporting.

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

### Notes

* On non-Raspberry Pi devices, Mosquitto (the MQTT server) may default to not allowing anonymous (un-authenticated) connections to MQTT. To fix this edit `/etc/mosquitto/conf.d/local.conf` and set `allow_anonymous` to `true`.
* By default the HTTP server in EspruinoHub is enabled, however it can be disabled by setting `http_port` to `0` in `config.json`
* The HTTP Proxy service is disabled by default and needs some configuration - see **HTTP Proxy** below
* You used to need a local copy of the Espruino Web IDE, however now EspruinoHub just serves up an IFRAME which points to the online IDE, ensuring it is always up to date.


Usage
-----

Once started, you then have a few options...

### Status / Websocket MQTT / Espruino Web IDE

By default EspruinoHub starts a web server at http://localhost:1888 that serves
the contents of the `www` folder. **You can disable this by setting `http_port`
to 0 in `config.json`**.

With that server, you can:

* See the Intro page
* See the status and log messages at http://localhost:1888/status
* Access the Espruino Web IDE at http://localhost:1888/ide. You
can then connect to any Bluetooth LE device within range of EspruinoHub.
* View real-time Signal Strength data via WebSockets at http://localhost:1888/rssi.html
* View real-time MQTT data via WebSockets at http://localhost:1888/mqtt.html
* View any of your own pages that are written into the `www` folder. For instance
you could use [TinyDash](https://github.com/espruino/TinyDash) with the code
from `www/mqtt.html` to display the latest BLE data that you have received.


### Node-RED / MQTT

You can access Node-RED using `http://localhost:1880`

Once you add UI elements and click `Deploy` they'll be visible at `http://localhost:1880/ui`

The easiest way to get data is to add an MQTT listener node that requests
`/ble/advertise/#` (`#` is a wildcard). This will output all information received
via advertising.

Useful MQTT advertising parts are:

* `/ble/presence/DEVICE` - 1 or 0 depending on whether device has been seen or not
* `/ble/advertise/DEVICE` - JSON for device's broadcast name, rssi and manufacturer-specific data
* `/ble/advertise/DEVICE/manufacturer/COMPANY` - Manufacturer-specific data (without leading company code)
* `/ble/advertise/DEVICE/rssi` - Device signal strength
* `/ble/advertise/DEVICE/SERVICE` - Raw service data (as a JSON Array of bytes)
* `/ble/advertise/DEVICE/PRETTY` or `/ble/PRETTY/DEVICE` - Decoded service data. `temp` is the obvious one

To decode the hex-encoded manufacturer-specific data, try:

```
var data = Buffer.from(msg.payload.manufacturerData, 'hex');
```

You can also connect to a device:

* `/ble/write/DEVICE/SERVICE/CHARACTERISTIC` connects and writes to the charactertistic
* `/ble/read/DEVICE/SERVICE/CHARACTERISTIC` connects and reads from the charactertistic
* `/ble/notify/DEVICE/SERVICE/CHARACTERISTIC` connects and starts notifications on the characteristic, which
send data back on `/ble/data/DEVICE/SERVICE/CHARACTERISTIC`
* `/ble/ping/DEVICE` connects, or maintains a connection to the device, and sends `/ble/pong/DEVICE` on success

`SERVICE` and `CHARACTERISTIC` are either known names from [attributes.js](https://github.com/espruino/EspruinoHub/blob/master/lib/attributes.js)
such as `nus` and `nus_tx` or are of the form `6e400001b5a3f393e0a9e50e24dcca9e` for 128 bit uuids or `abcd` for 16 bit UUIDs.

After connecting, EspruinoHub will stay connected for a few seconds unless there is
any activity (eg a `write` or `ping`). So you can for instance evaluate something
on a Puck.js BLE UART connection with:

```
=> /ble/notify/c7:f9:36:dd:b0:ca/nus/nus_rx
"\x10E.getTemperature()\n" => /ble/write/c7:f9:36:dd:b0:ca/nus/nus_tx

/ble/data/c7:f9:36:dd:b0:ca/nus/nus_rx => "23\r\n"
```

**You can also gather historical data over MQTT - see the `History` section
below.**

### MQTT Command-line

These commands use the Mosquitto command-line tools:

```
# listen to all, verbose
mosquitto_sub -h localhost -t /# -v

# Test publish
mosquitto_pub -h localhost -t test/topic -m "Hello world"
```

You can use the commands in the section above to make things happen from the command-line.

History
-------

EspruinoHub contains code (`libs/history.js`) that subscribes to any MQTT data
beginning with `/ble/` and that then stores logs of the average value
every minute, 10 minutes, hour and day (see `config.js:history_times`). The
averages are broadcast over MQTT as the occur, but can also be queried by sending
messages to `/hist/request`.

For example, an Espruino device with address `f5:47:c8:0b:49:04` may broadcast
advertising data with UUID `1809` (Temperature) with the following code:

```
setInterval(function() {
  NRF.setAdvertising({
    0x1809 : [Math.round(E.getTemperature())]
  });
}, 30000);
```

This is decoded into `temp` by `attributes.js`, and it sends the following MQTT
packets:

```
/ble/advertise/f5:47:c8:0b:49:04 {"rssi":-53,"name":"...","serviceUuids":["6e400001b5a3f393e0a9e50e24dcca9e"]}
/ble/advertise/f5:47:c8:0b:49:04/rssi -53
/ble/advertise/f5:47:c8:0b:49:04/1809 [22]
/ble/advertise/f5:47:c8:0b:49:04/temp 22
/ble/temp/f5:47:c8:0b:49:04 22
```

You can now subscribe with MQTT to `/hist/hour/ble/temp/f5:47:c8:0b:49:04` and
every hour you will receive a packet containing the average temperature over
that time.

However, you can also request historical data by sending the JSON:

```
{
  "topic" : "/hist/hour/ble/temp/f5:47:c8:0b:49:04",
  "interval" : "minute",
  "age" : 6  
}
```

to `/hist/request/a_unique_id`. EspruinoHub will then send a packet to
`/hist/response/a_unique_id` containing:

```
{
  "interval":"minute",
  "from":1531227216903, // unix timestamp (msecs since 1970)
  "to":1531234416903,   // unix timestamp (msecs since 1970)
  "topic":"/hist/hour/ble/temp/f5:47:c8:0b:49:04",
  "times":[ array of unix timestamps ],
  "data":[ array of average data values ]
}
```

Requests can be of the form:

```
{
  topic : "/ble/advertise/...",
  "interval" : "minute" / "tenminutes" / "hour" / "day"
  // Then time period is either:
  "age" : 1, // hours
  // or:
  "from" : "1 July 2018",
  "to" : "5 July 2018"     (or anything that works in new Date(...))  
}
```

For a full example of usage see `www/rssi.html`.


HTTP Proxy
----------

EspruinoHub implements the [Bluetooth HTTP Proxy service](https://www.bluetooth.com/specifications/gatt/viewer?attributeXmlFile=org.bluetooth.service.http_proxy.xml)

The HTTP Proxy is disabled by default as it can give any Bluetooth LE device in range access to your network. To fix this, edit the `http_proxy` and `http_whitelist` entries in `config.json` to enable the proxy and whitelist devices based on address (which you can find from EspruinoHub's status of MQTT advertising packets).

To allow Bluetooth to advertise services (for the HTTP proxy) you also need:

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

* Handle over-size reads and writes for HTTP Proxy
