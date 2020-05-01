#!/bin/bash
cd `dirname $0`

# Stop terminal screensaver
setterm --blank 0

sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

if node needs-bleno.js > /dev/null; then
  echo "Starting with Bleno (GATT Server)"
  export BLENO_ADVERTISING_INTERVAL=300
  export NOBLE_MULTI_ROLE=1
else
  echo "Starting without Bleno (GATT Server)"
  # Don't force multi-role if there's no HTTP proxy needed
fi

# start properly
node index.js
