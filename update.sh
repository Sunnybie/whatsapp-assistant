#!/usr/bin/env bash
# Pull the latest code from GitHub and restart the bot.
# If a leftover local touch (e.g. an old chmod) blocks the pull, reset tracked files and retry.
cd "$(dirname "$0")"

git pull --ff-only || {
  echo "Local script changes are blocking the update - resetting them and trying again."
  git checkout -- .
  git pull --ff-only
}
exec bash run.sh
