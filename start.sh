#!/bin/bash
cd `dirname $0`

# Stop terminal screensaver
setterm --blank 0

sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

BLENO_ADVERTISING_INTERVAL=300 NOBLE_MULTI_ROLE=1 node index.js
