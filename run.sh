#!/usr/bin/env bash
# Start the WhatsApp assistant (used on the phone from Termux).
# If the bot stops on its own (crash/network blip), it is restarted after 5s.
# CTRL+C still stops everything immediately.
cd "$(dirname "$0")"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

set -a
[ -f .env ] && . ./.env
set +a

until node bot.js; do
  echo ""
  echo "Bot stopped on its own - restarting in 5 seconds (press CTRL then C to stay stopped)."
  sleep 5
done

if command -v termux-wake-unlock >/dev/null 2>&1; then
  termux-wake-unlock
fi
