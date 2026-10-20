#!/usr/bin/env bash
# Turn auto-reply on or off:  bash reply.sh on   /   bash reply.sh off
cd "$(dirname "$0")"

case "$1" in
  on|ON|true|TRUE)  V=true ;;
  off|OFF|false|FALSE) V=false ;;
  *)
    echo "Usage: bash reply.sh on   or   bash reply.sh off"
    exit 1
    ;;
esac

sed -i "s|^AUTO_REPLY=.*|AUTO_REPLY=$V|" .env
echo "AUTO_REPLY is now: $V"
echo "Restart the bot to apply it (Ctrl+C, then: bash run.sh)"
