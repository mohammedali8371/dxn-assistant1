#!/bin/bash
# ===== DXN Assistant - VPS Setup Script =====
# تشغيل: bash setup_vps.sh
set -e

echo "=== 1) إيقاف جميع البوتات القديمة ==="
# إيقاف بوت OSINT القديم
if [ -f /home/daytona/osint_bot/stop.sh ]; then
  bash /home/daytona/osint_bot/stop.sh || true
fi
# إيقاف أي عمليات node/python قديمة مرتبطة بالبوتات
pkill -f "osint_bot/main.py" || true
pkill -f "fundingbot" || true
pkill -f "dxn-assistant/index.js" || true
sleep 2
echo "تم إيقاف البوتات القديمة"

echo "=== 2) فحص Node.js ==="
if command -v node >/dev/null 2>&1; then
  echo "Node موجود: $(node -v)"
else
  echo "Node غير موجود - جارٍ التثبيت..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "=== 3) تجهيز مجلد المشروع ==="
PROJECT_DIR=/home/daytona/dxn-assistant
mkdir -p $PROJECT_DIR/logs
mkdir -p $PROJECT_DIR/sessions
chmod 700 $PROJECT_DIR/sessions

echo "=== 4) تثبيت الاعتماديات ==="
cd $PROJECT_DIR
npm install --omit=dev

echo "=== 5) إعداد خدمة systemd ==="
cp deploy/dxn-assistant.service /etc/systemd/system/dxn-assistant.service
systemctl daemon-reload
systemctl enable dxn-assistant

echo "=== 6) التحقق من ملف .env ==="
if [ ! -f $PROJECT_DIR/.env ]; then
  echo "⚠️ لا يوجد ملف .env! أنشئه أولاً من .env.vps.example"
  exit 1
fi

echo "=== 7) تشغيل البوت ==="
systemctl restart dxn-assistant
sleep 5
systemctl status dxn-assistant --no-pager | head -20
echo "=== تم ✅ ==="
echo "للتحقق من السجلات: journalctl -u dxn-assistant -f"
