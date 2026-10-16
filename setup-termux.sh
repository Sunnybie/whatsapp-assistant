#!/usr/bin/env bash
# One-time setup for running the WhatsApp assistant inside Termux (Android).
# Usage:  curl -sL https://raw.githubusercontent.com/Sunnybie/whatsapp-assistant/main/setup-termux.sh | bash
set -e

echo "== WhatsApp Assistant - phone setup =="
echo ""

pkg update -y
if ! pkg install -y nodejs-lts; then
  pkg install -y nodejs
fi
pkg install -y git

cd "$HOME"
if [ -d whatsapp-assistant/.git ]; then
  cd whatsapp-assistant
  git pull --ff-only || true
else
  git clone https://github.com/Sunnybie/whatsapp-assistant
  cd whatsapp-assistant
fi

chmod +x run.sh allow.sh setup-termux.sh 2>/dev/null || true
npm install --omit=optional --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Two quick questions:"
  printf "1) Paste your Google Gemini API key, then press Enter: "
  read -r KEY </dev/tty
  printf "2) Your WhatsApp number (country code first, digits only, e.g. 2348012345678): "
  read -r NUM </dev/tty
  sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${KEY}|" .env
  sed -i "s|^PAIRING_NUMBER=.*|PAIRING_NUMBER=${NUM}|" .env
fi

echo ""
echo "Setup complete."
printf "Start the bot now? [y/N] "
read -r GO </dev/tty
if [ "$GO" = "y" ] || [ "$GO" = "Y" ]; then
  bash run.sh
else
  echo "Start it later with:  cd ~/whatsapp-assistant && bash run.sh"
fi
