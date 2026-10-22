# Changelog

## 2026-10-22 — Voice notes, photos, and self-healing

- **Voice notes are transcribed.** The bot downloads incoming voice notes,
  sends them to Gemini, and answers the actual spoken content (verified
  end-to-end with a test recording). If transcription fails, it falls back
  to the old "X sent a voice note" acknowledgment.
- **Photos get a short description**, same mechanism, so the assistant can
  react to screenshots and images too.
- **The bot restarts itself.** `run.sh` re-launches the bot if it stops on
  its own (crash or network blip); CTRL then C still stops it completely.
- **Start on phone boot.** The setup script installs a Termux:Boot entry so
  the bot starts after a phone restart; install the Termux:Boot app from
  F-Droid to enable it (give it the same Unrestricted-battery setting).

## 2026-10-19 — Easier installing and operating

- **The setup script now checks your answers.** It rejects Gemini keys that
  are too short and phone numbers that start with `0` or look wrong -
  with a clear hint - instead of saving a bad value and failing later.
- **Setup now ends with a "how to drive the bot" box** covering start,
  stop (CTRL then C), adding contacts, and the battery setting.
- **New helper scripts** (no more typing edit-commands):
  - `bash reply.sh on` / `bash reply.sh off` - turn auto-reply on or off
  - `bash update.sh` - pull the latest code and restart in one step
- **Urgent messages now alert the phone directly.** When a message
  containing "urgent", "emergency", or "asap" arrives, the phone pops a
  notification and the flashlight strobes + vibrates until you press Enter
  in Termux (with a ~10 minute safety stop). The local alert is the reliable
  channel: the copy sent to your own WhatsApp chat can sometimes stick as
  "Waiting for this message" on the phone (a WhatsApp key-sync quirk linked
  devices can't control), but the notification and strobe don't depend on
  WhatsApp at all. Needs the Termux:API app from F-Droid set to
  **Unrestricted battery** (same as Termux, or Android kills the strobe);
  the setup script installs the `termux-api` package automatically.
- **Relinking is automatic now:** if WhatsApp unlinks the bot, it wipes its
  old login so the next start offers a fresh pairing code instead of
  looping "logged out".

## 2026-10-18 — Message handling improvements

- **Longer, lasting memory.** The assistant now remembers more of each
  conversation (set `HISTORY_LIMIT` in `.env`, default 12 messages per chat)
  and the memory is saved to `history.json`, so it survives restarts —
  no more starting every chat from zero after a reboot.

- **Voice notes and media no longer get silence.** A voice note, photo,
  video, document, or sticker without a caption now gets a normal assistant
  reply ("X sent a voice note…") so the sender knows it was seen.
- **Message bursts get one reply, not five.** When someone sends several
  messages in a row, the bot waits 10 seconds after the last one
  (adjustable with `REPLY_DELAY_SECONDS` in `.env`) and answers everything
  together in one message.
- **Urgent messages reach Sunny directly.** Messages containing
  "urgent", "emergency", or "asap" are copied to Sunny's own WhatsApp chat
  so he sees them even while away.

## 2026-10-17 — Phone setup corrections

For the full history, see the git log.
