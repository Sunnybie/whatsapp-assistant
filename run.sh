#!/usr/bin/env bash
# Start the WhatsApp assistant (used on the phone from Termux).
cd "$(dirname "$0")"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

set -a
[ -f .env ] && . ./.env
set +a

node bot.js

if command -v termux-wake-unlock >/dev/null 2>&1; then
  termux-wake-unlock
fi
