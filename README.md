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
sudo apt-get update
# OPTIONAL: Update everything to latest versions
sudo apt-get upgrade -y 
# Get required packages
sudo apt-get install -y build-essential python-rpi.gpio nodejs nodered git-core
# OPTIONAL: Install a modern version of nodejs and nodered
# Not recommended - The Pi's supplied Node.js version is more than good enough
# bash <(curl -sL https://raw.githubusercontent.com/node-red/raspbian-deb-package/master/resources/update-nodejs-and-nodered)
# Get dependencies
sudo apt-get install -y mosquitto mosquitto-clients bluetooth bluez libbluetooth-dev libudev-dev
# Auto start Node-RED
sudo systemctl enable nodered.service
# Start nodered manually this one time (this creates ~/.node-red)
sudo systemctl start nodered.service
# wait for the ~/.node-red directory to get created...
# Install the Node-RED UI
cd ~/.node-red && npm install node-red-contrib-ui
# Now get EspruinoHub
cd ~/
git clone https://github.com/espruino/EspruinoHub
# Install EspruinoHub's required Node libraries
cd EspruinoHub
npm install

# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

# You may need to run the setcap line above again if you update Node.js
```

You can now type `./start.sh` to run EspruinoHub, but it's worth checking out the `Auto Start` section to see how to get it to run at boot.

### Installation of EspruinoHub and Web IDE

```
# Install Node, Bluetooth, etc
sudo apt-get update
# OPTIONAL: Update everything to latest versions
sudo apt-get upgrade -y 
# Get required packages
sudo apt-get install -y git-core nodejs npm build-essential mosquitto mosquitto-clients bluetooth bluez libbluetooth-dev libudev-dev
# Now get EspruinoHub
git clone https://github.com/espruino/EspruinoHub
# Install EspruinoHub's required Node libraries
cd EspruinoHub
npm install

# Give Node.js access to Bluetooth
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

# You may need to run the setcap line above again if you update Node.js
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

### Uninstalling

Assuming you followed the steps above (including for 'Headless Startup') you can
uninstall EspruinoHub using the following commands:

```
sudo systemctl stop EspruinoHub.service
sudo systemctl disable EspruinoHub.service
sudo rm /etc/systemd/system/EspruinoHub.service
sudo rm -rf ~/EspruinoHub
```

Run with Docker
---------------

Build on Raspberry Pi Zero:

    docker build -t espruino/espruinohub:armhf https://github.com/espruino/EspruinoHub.git

Run from the directory containing your `config.json`:

    docker run -d -v $PWD/config.json:/EspruinoHub/config.json:ro --restart=always --net=host --name espruinohub espruino/espruinohub:armhf

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

### MQTT / Node-RED

If set up, you can access Node-RED using `http://localhost:1880`

Once you add UI elements and click `Deploy` they'll be visible at `http://localhost:1880/ui`

The easiest way to get data is to add an MQTT listener node that requests
`/ble/advertise/#` (`#` is a wildcard). This will output all information received
via advertising (see 'Advertising Data' below).

For more info on available MQTT commands see the 'MQTT Bridge' section below.

Check out http://www.espruino.com/Puck.js+Node-RED for a proper introduction
on using Node-RED.

### MQTT Command-line

You can use the Mosquitto command-line tools to send and receive MQTT data
that will make `EspruinoHub` do things:

```
# listen to all, verbose
mosquitto_sub -h localhost -t "/#" -v

# listen to any device advertising a 1809 temperature characteristic and
# output *just* the temperature
mosquitto_sub -h localhost -t "/ble/advertise/+/temp"

# Test publish
mosquitto_pub -h localhost -t test/topic -m "Hello world"
```

For more info on available MQTT commands see the 'MQTT Bridge' section below.


MQTT bridge
-----------

### Advertising

Data that is received via bluetooth advertising will be relayed over MQTT in the following format:

* `/ble/presence/DEVICE` - 1 or 0 depending on whether device has been seen or not
* `/ble/advertise/DEVICE` - JSON for device's broadcast name, rssi and manufacturer-specific data (if `mqtt_advertise=true` in `config.json` - the default)
* `/ble/advertise/DEVICE/manufacturer/COMPANY` - Manufacturer-specific data (without leading company code) encoded in base16. To decode use `var data = Buffer.from(msg.payload, 'hex');` (if `mqtt_advertise_manufacturer_data=true` in `config.json` - the default)
* `/ble/advertise/DEVICE/rssi` - Device signal strength
* `/ble/advertise/DEVICE/SERVICE` - Raw service data (as a JSON Array of bytes) (if `mqtt_advertise_service_data=true` in `config.json`)
* `/ble/advertise/DEVICE/PRETTY` or `/ble/PRETTY/DEVICE` - Decoded service data based on the decoding in `attributes.js`
  * `1809` decodes to `temp` (Temperature in C)
  * `180f` decodes to `battery`
  * `feaa` decodes to `url` (Eddystone)
  * `2a6d` decodes to `pressure` (Pressure in pa)
  * `2a6e` decodes to `temp` (Temperature in C)
  * `2a6f` decodes to `humidity` (Humidity in %)
  * `ffff` decodes to `data` (This is not a standard - however it's useful for debugging or quick tests)
* `/ble/json/DEVICE/UUID` - Decoded service data (as above) as JSON, eg `/ble/json/DEVICE/1809 => {"temp":16.5}`  (if `mqtt_format_json=true` in `config.json` - the default)
* `/ble/advertise/DEVICE/espruino` - If manufacturer data is broadcast Espruino's manufacturer ID `0x0590` **and** it is valid JSON, it is rebroadcast. If an object like `{"a":1,"b":2}` is sent, `/ble/advertise/DEVICE/a` and `/ble/advertise/DEVICE/b` will also be sent. (A JSON5 parser is used, so the more compact `{a:1,b:2}` is also valid).

You can take advantage of Espruino's manufacturer ID `0x0590` to relay JSON over
Bluetooth LE advertising using the following code on an Espruino board:

```
var data = {a:1,b:2};
NRF.setAdvertising({},{
  showName:false,
  manufacturer:0x0590,
  manufacturerData:E.toJS(data) 
});
// Note: JSON.stringify(data) can be used instead of
// E.toJS(data) to produce 'standard' JSON like {"a":1,"b":2}
// instead of E.toJS's more compact {a:1,b:2}
```

Assuming a device with an address of `ma:c_:_a:dd:re:ss` this will create the
folling MQTT topics when `mqtt_advertise_manufacturer_data` is `true` in `config.json`:

* `/ble/advertise/ma:c_:_a:dd:re:ss/espruino` -> `{"a":1,"b":2}`
* `/ble/advertise/ma:c_:_a:dd:re:ss/a` -> `1`
* `/ble/advertise/ma:c_:_a:dd:re:ss/b` -> `2`

Note that **you only have 24 characters available for JSON**, so try to use
the shortest field names possible and avoid floating point values that can
be very long when converted to a String.


### Connections

You can also connect to a device using MQTT packets:

* `/ble/write/DEVICE/SERVICE/CHARACTERISTIC` connects and writes to the charactertistic
* `/ble/read/DEVICE/SERVICE/CHARACTERISTIC` connects and reads from the charactertistic, sending the result back as a topic `/ble/data/DEVICE/SERVICE/CHARACTERISTIC`
* `/ble/read/DEVICE` connects and reads an array of services and charactertistics
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
"\x10Bluetooth.println(E.getTemperature())\n" => /ble/write/c7:f9:36:dd:b0:ca/nus/nus_tx

/ble/data/c7:f9:36:dd:b0:ca/nus/nus_rx => "23\r\n"
```

Once a `/ble/write/DEVICE/SERVICE/CHARACTERISTIC` has been executed, a `/ble/written/DEVICE/SERVICE/CHARACTERISTIC` packet will be sent in response.

Payload can take the following values
- **object as json** with type and data fields
  available values for `type` =` Buffer, buffer, hex`
- *boolean* uint8
- *integer* uint8
- *array* will be loop-encoded in uint8
- *string* will be loop-encoded in uint8

### History

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

**NOTE:** Some Bluetooth adaptors (eg CSR / `0a12:0001`) will cause the error `Command Disallowed (0xc)` when attempting to connect to a device when `http_proxy` is enabled.

To allow Bluetooth to advertise services (for the HTTP proxy) you also need:

```
# Stop the bluetooth service
sudo service bluetooth stop
# Start Bluetooth but without bluetoothd
sudo hciconfig hci0 up
```

See https://github.com/sandeepmistry/bleno


Home Assistant Integration
--------------------------

Follow the instructions at https://www.home-assistant.io/integrations/mqtt/ to enable Home Assistant to use an external MQTT broker. Assuming you're running on the same device as EspruinoHub, use `localhost` as the IP address for the MQTT server.

Ensure that `homeassistant` is set to `true` in EspruinoHub's `config.json`. It's currently the default.

Now, in the Home Assistant main page you should see new Sensors and Binary sensors which match any devices that EspruinoHub has found!


Troubleshooting
---------------

### When using the HTTP Proxy I get `BLOCKED` returned in the HTTP body

Your BLE device isn't in the whitelist in `config.json` - because the HTTP Proxy
exposes your internet connection to the world, only BLE devices with the addresses
you have specified beforehand are allowed to connect.


TODO
----

* Handle over-size reads and writes for HTTP Proxy
