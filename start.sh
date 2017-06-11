#!/bin/bash
cd `dirname $0`

BLENO_ADVERTISING_INTERVAL=300 NOBLE_MULTI_ROLE=1 node index.js
