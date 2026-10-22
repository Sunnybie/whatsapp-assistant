#!/usr/bin/env bash
# Urgent alert, called by bot.js with: bash flash.sh "<sender name>" "<message text>"
# 1) pops a phone notification right away (works even if WhatsApp can't decrypt
#    the copy the bot sends to your own chat)
# 2) then lights the torch (steady) and vibrates every 2s until the user
#    presses Enter (~10 minute safety stop). If the light stops early,
#    Android has put the Termux:API app to sleep - set its battery to
#    Unrestricted like Termux.
# Requires the Termux:API app (install from F-Droid) and: pkg install termux-api
NAME="${1:-someone}"
TEXT="${2:-urgent message received}"

if command -v termux-notification >/dev/null 2>&1; then
  termux-notification -t "URGENT WhatsApp from $NAME" -c "$TEXT"
fi

command -v termux-torch >/dev/null 2>&1 || exit 0

trap 'termux-torch off >/dev/null 2>&1; exit 0' INT TERM EXIT

echo ""
echo "!!! URGENT MESSAGE from $NAME - press Enter here to turn the light off !!!"

# steady light, not a strobe: rapid on/off toggles race the camera manager on
# some phones and the torch silently dies after the first flash
termux-torch on >/dev/null 2>&1

END=$((SECONDS + 600))
while [ "$SECONDS" -lt "$END" ]; do
  termux-vibrate -d 300 >/dev/null 2>&1 || true
  read -t 2 -n 1 && break
done
