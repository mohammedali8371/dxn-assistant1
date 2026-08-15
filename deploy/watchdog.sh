#!/bin/bash
# ===== DXN Assistant - Watchdog (24/7) =====
# يعيد تشغيل البوت إذا توقف. يُشغَّل: nohup bash /home/daytona/dxn-assistant/deploy/watchdog.sh &
while true; do
  if ! pgrep -f '[d]xn-assistant/index.js' >/dev/null 2>&1; then
    cd /home/daytona/dxn-assistant || continue
    nohup node index.js >> /home/daytona/dxn-assistant/logs/service.log 2>&1 &
    echo "$(date '+%F %T') watchdog: dxn-assistant restarted (pid $!)" >> /home/daytona/dxn-assistant/logs/watchdog.log
  fi
  sleep 30
done
