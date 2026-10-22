#!/usr/bin/env bash
# Urgent alert, called by bot.js with: bash flash.sh "<sender name>" "<message text>"
# 1) pops a phone notification (with a vibration pattern) right away
# 2) then blinks the torch slowly until the user presses Enter (~10 min safety stop)
# Requires the Termux:API app (install from F-Droid) and: pkg install termux-api
# ponytail: some phones (e.g. Tecno/Infinix) force-release the torch after ~3s,
# so the blink is paced at 2.5s; if the light still dies, notification+vibrate
# remain as the reliable alert. Ceiling: no sustained torch from a background app.
NAME="${1:-someone}"
TEXT="${2:-urgent message received}"

if command -v termux-notification >/dev/null 2>&1; then
  termux-notification -t "URGENT WhatsApp from $NAME" -c "$TEXT" --vibrate 500,1000,500,1000,500 \
    || termux-notification -t "URGENT WhatsApp from $NAME" -c "$TEXT" || true
fi

command -v termux-torch >/dev/null 2>&1 || exit 0

trap 'termux-torch off >/dev/null 2>&1; exit 0' INT TERM EXIT

echo ""
echo "!!! URGENT MESSAGE from $NAME - press Enter here to stop the alert !!!"

END=$((SECONDS + 600))
while [ "$SECONDS" -lt "$END" ]; do
  termux-torch on >/dev/null 2>&1
  read -t 2.5 -n 1 && break
  termux-torch off >/dev/null 2>&1
  read -t 0.4 -n 1 && break
  termux-vibrate -d 300 >/dev/null 2>&1 || true
done
