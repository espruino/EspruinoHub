#!/bin/bash
cd `dirname $0`

# Stop terminal screensaver
setterm --blank 0

BLENO_ADVERTISING_INTERVAL=700 NOBLE_MULTI_ROLE=1 nodemon index.js
