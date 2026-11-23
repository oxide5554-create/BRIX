#!/bin/bash
# BRIX watchdog v0.5.14: держит игровые серверы живыми.
# Раз в 15 с проверяет порты 8787 (brixland) и 8788 (brixpvp);
# если процесс умер (песочница перезапустилась, краш) — поднимает заново.
# Логи: /tmp/render/ka-main.log, /tmp/render/ka-pvp.log, /tmp/render/ka-watch.log

REPO=/home/z/my-project/repo
mkdir -p /tmp/render

port_up() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null && exec 3>&- ; }

while true; do
  if ! port_up 8787; then
    echo "$(date '+%H:%M:%S') 8787 down — стартуем brixland" >> /tmp/render/ka-watch.log
    (cd "$REPO" && BRIX_REALM=brixland BRIX_PORT=8787 nohup node server.js >> /tmp/render/ka-main.log 2>&1 &)
  fi
  if ! port_up 8788; then
    echo "$(date '+%H:%M:%S') 8788 down — стартуем brixpvp" >> /tmp/render/ka-watch.log
    (cd "$REPO" && BRIX_REALM=brixpvp BRIX_PORT=8788 nohup node server.js >> /tmp/render/ka-pvp.log 2>&1 &)
  fi
  sleep 15
done
