#!/usr/bin/env bash
# Pull the latest code from GitHub and restart the bot.
cd "$(dirname "$0")"

git pull --ff-only
exec bash run.sh
