#!/bin/bash
# ===== DXN Assistant - Start script (nohup) =====
cd /home/daytona/dxn-assistant
pkill -f '[d]xn-assistant/index.js' 2>/dev/null
sleep 1
nohup node index.js >> /home/daytona/dxn-assistant/logs/service.log 2>&1 &
echo "DXN started (pid $!)"
sleep 3
pgrep -af 'dxn-assistant/index.js'
