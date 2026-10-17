#!/bin/sh
set -eu

/usr/bin/docker exec tikuv-market-web-1 nginx -s reload
