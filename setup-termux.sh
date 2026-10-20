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
pkg install -y termux-api

cd "$HOME"
if [ -d whatsapp-assistant/.git ]; then
  cd whatsapp-assistant
  git pull --ff-only || true
else
  git clone https://github.com/Sunnybie/whatsapp-assistant
  cd whatsapp-assistant
fi

chmod +x run.sh allow.sh reply.sh update.sh flash.sh setup-termux.sh 2>/dev/null || true
npm install --omit=optional --no-audit --no-fund

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Two quick questions:"
  while :; do
    printf "1) Paste your Google Gemini API key, then press Enter: "
    read -r KEY </dev/tty
    KEY=$(echo "$KEY" | tr -d '[:space:]')
    if [ ${#KEY} -ge 20 ]; then break; fi
    echo "   That key looks too short - copy the whole key from https://aistudio.google.com/apikey and try again."
  done
  while :; do
    printf "2) Your WhatsApp number (country code first, digits only, e.g. 2348012345678): "
    read -r NUM </dev/tty
    NUM=$(echo "$NUM" | tr -cd '0-9')
    if [ -z "$NUM" ]; then
      echo "   Digits only please. Try again."
    elif [ "${NUM#0}" != "$NUM" ]; then
      echo "   Don't start with 0 - drop the leading 0 and add your country code (Nigeria: 234...). Try again."
    elif [ ${#NUM} -lt 11 ]; then
      echo "   That number looks too short. Try again."
    else
      break
    fi
  done
  sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=${KEY}|" .env
  sed -i "s|^PAIRING_NUMBER=.*|PAIRING_NUMBER=${NUM}|" .env
fi

echo ""
echo "=========================================="
echo "  SETUP COMPLETE - how to drive the bot"
echo "=========================================="
echo "  Start:             bash run.sh"
echo "  Stop:              tap CTRL then C in Termux"
echo "  Add a contact:     bash allow.sh 2348012345678"
echo "  Auto-reply on/off: bash reply.sh on   (or: off)"
echo "  Get updates:       bash update.sh"
echo ""
echo "  Keep Termux battery UNRESTRICTED"
echo "  (Android Settings -> Apps -> Termux -> Battery)"
echo ""
echo "  Flash alerts: install the Termux:API app from F-Droid"
echo "  (needed for the urgent-message flashlight strobe)"
echo "=========================================="

echo ""
echo "Setup complete."
printf "Start the bot now? [y/N] "
read -r GO </dev/tty
if [ "$GO" = "y" ] || [ "$GO" = "Y" ]; then
  bash run.sh
else
  echo "Start it later with:  cd ~/whatsapp-assistant && bash run.sh"
fi
