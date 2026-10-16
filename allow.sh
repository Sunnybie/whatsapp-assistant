#!/usr/bin/env bash
# Allow a contact to be replied to:  bash allow.sh 2348012345678
cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "Usage: bash allow.sh 2348012345678   (full number, country code first)"
  exit 1
fi

NUM=$(echo "$1" | tr -cd '0-9')
CUR=$(grep '^ALLOWLIST=' .env | cut -d= -f2-)
if [ -z "$CUR" ]; then
  NEW="$NUM"
else
  NEW="$CUR,$NUM"
fi
sed -i "s|^ALLOWLIST=.*|ALLOWLIST=$NEW|" .env
echo "ALLOWLIST is now: $NEW"
echo "Restart the bot to apply it (Ctrl+C, then: bash run.sh)"
