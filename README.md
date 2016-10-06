
sudo apt-get install node npm mosquitto mosquitto-clients

# As it comes, NPM on the Pi is broken
# and doesn't like installing native libs
sudo npm -g install npm node-gyp

npm install noble

sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

Take a look at your mosquitto.conf, is there a "listener" line in there? Change
listener 1883 127.0.0.1
to
listener 1883


# listen to all, verbose
mosquitto_sub -h localhost -t /# -v

 mosquitto_pub -h localhost -t test/topic -m "Hello world"
