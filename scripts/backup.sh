#!/bin/sh
set -eu
mkdir -p /backups
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  pg_dump -Fc -f "/backups/armarios-$stamp.dump"
  find /backups -type f -name 'armarios-*.dump' -mtime +29 -delete
  sleep 86400
done
