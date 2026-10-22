# Changelog

## 2026-10-22 — Voice notes, photos, self-healing, and stranger handling

- **Strangers get a receptionist intake.** With `ALLOWLIST=*`, a number that
  is not listed explicitly gets a first-contact reply that asks who they are
  and what the message is about, so Sunny gets a clean summary instead of a
  bare unknown-number thread. Explicitly allowlisted contacts are never
  intaked.
- **Quiet hours.** Overnight (default `23-7`, set `QUIET_HOURS` to change,
  empty to disable) the assistant saves incoming messages to memory but stays
  silent; the next message the person sends after the window ends gets a
  normal reply with full context. Urgent alerts (notification + flashlight +
  self-chat copy) still fire at any hour.
- **Stranger reply cap.** With `ALLOWLIST=*`, each unknown number can receive
  at most `MAX_REPLIES_PER_CHAT_PER_DAY` (default 10) assistant replies per
  day, so a junk number can't burn the free Gemini quota. Explicitly
  allowlisted contacts are never capped. Counts persist in
  `reply-counts.json` (gitignored, never uploaded).
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
- **Updates unblock themselves.** If a leftover file touch (like an old
  `chmod`) blocks `git pull`, `update.sh` now resets the scripts and retries
  on its own, and the installer no longer chmods files it installs.

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
  notification (with a vibration pattern) and blinks the flashlight slowly
  until you press Enter in Termux (with a ~10 minute safety stop). The local
  alert is the reliable channel: the copy sent to your own WhatsApp chat can
  sometimes stick as "Waiting for this message" on the phone (a WhatsApp
  key-sync quirk linked devices can't control), but the notification doesn't
  depend on WhatsApp at all. Torch reality on some phones (Tecno/Infinix):
  the camera manager force-releases the torch after ~3 seconds, so it can
  blink but never stay lit - the blink is paced at 2.5s and the vibration
  pattern carries the alert regardless. Needs the Termux:API app from F-Droid
  set to **Unrestricted battery** (same as Termux, or Android kills the
  light); the setup script installs the `termux-api` package automatically.
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

All fixes from getting the assistant running on the Android phone (Termux):

- **Fixed the "logged out of WhatsApp" loop after a pairing code expires.**
  If the 8-digit code wasn't entered in time, the saved login was left
  half-finished and every restart tried to log in as a ghost device.
  The bot now detects a half-finished login, wipes it, and offers a fresh
  pairing code instead of erroring out.
- **Made the pairing code impossible to miss.** It now prints once in a
  boxed banner at startup. The QR-code refreshes that used to scroll after
  it (and bury it) no longer print when pairing by phone number.
- **Fixed replies not working for chats that arrive as privacy IDs
  (`...@lid`).** WhatsApp routes many chats through hidden IDs instead of
  phone numbers, so allowlist entries (and the `*` wildcard) never matched.
  The bot now also checks the sender's real phone number, so those chats are
  matched correctly.
- **Persona set:** the assistant introduces itself as "Sunny's assistant"
  (`instructions.md`).

## 2026-10-16 — Initial release

- Reply-only WhatsApp assistant (Baileys + Gemini), allowlist-protected,
  watch mode before auto-reply.
- Phone support: Termux one-line installer (`setup-termux.sh`), pairing-code
  linking ("Link with phone number instead"), `run.sh` / `allow.sh` helpers.
