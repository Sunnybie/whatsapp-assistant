#!/usr/bin/env bash
# Urgent alert, called by bot.js with: bash flash.sh "<sender name>" "<message text>"
# 1) pops a phone notification right away (works even if WhatsApp can't decrypt
#    the copy the bot sends to your own chat)
# 2) then flashes the torch and vibrates until the user presses Enter
#    (~10 minute safety stop). If the light stops early, Android has put the
#    Termux:API app to sleep - set its battery to Unrestricted like Termux.
# Requires the Termux:API app (install from F-Droid) and: pkg install termux-api
NAME="${1:-someone}"
TEXT="${2:-urgent message received}"

if command -v termux-notification >/dev/null 2>&1; then
  termux-notification -t "URGENT WhatsApp from $NAME" -c "$TEXT"
fi

command -v termux-torch >/dev/null 2>&1 || exit 0

trap 'termux-torch off >/dev/null 2>&1; exit 0' INT TERM EXIT

echo ""
echo "!!! URGENT MESSAGE from $NAME - press Enter here to stop the flashing !!!"

END=$((SECONDS + 600))
while [ "$SECONDS" -lt "$END" ]; do
  termux-torch on >/dev/null 2>&1
  sleep 0.7
  read -t 0.2 -n 1 && break
  termux-torch off >/dev/null 2>&1
  sleep 0.3
  read -t 0.2 -n 1 && break
  termux-vibrate -d 200 >/dev/null 2>&1 || true
done
