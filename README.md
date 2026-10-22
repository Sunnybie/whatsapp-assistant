# WhatsApp Assistant

A small Node.js bot that replies to chosen WhatsApp contacts **as your personal assistant** - while your own phone keeps working normally. It attaches to your WhatsApp as a "linked device" (like WhatsApp Web) and only ever replies to incoming messages from people you allow. It never starts conversations.

Built with [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web protocol) and Google Gemini for writing the replies. It runs on a computer, or directly on an Android phone with Termux - so it keeps working even when your computer is off.

## How it works

- Your phone stays the real WhatsApp. This bot is just an extra linked device.
- Someone on your ALLOWLIST sends you a direct message.
- The bot sends the message (plus the last few messages of that chat) to Google Gemini, which writes a reply using the rules in `instructions.md`.
- The bot sends that reply from your number, clearly written as "your assistant", and logs everything to the terminal.
- Voice notes are transcribed and answered, and photos get a short description - the sender knows they were heard/seen. Other media (video, documents, stickers) get an acknowledgment only.
- Messages containing words like "urgent" or "emergency" trigger a phone notification (with vibration) and blink the flashlight (press Enter in Termux to stop), and are copied to your own chat as a record. Note: the self-chat copy can occasionally show "Waiting for this message" on the phone - a WhatsApp quirk - but the notification always fires; on some phones the torch can only blink briefly, never stay on.
- Between 23:00 and 07:00 (configurable with `QUIET_HOURS`) the assistant stays silent: messages are saved to memory and answered when the person writes again after the window ends. Urgent alerts still fire at any hour.
- A first-time stranger (anyone not listed explicitly in `ALLOWLIST`, only possible when `ALLOWLIST=*`) gets a receptionist reply - the assistant asks who they are and what it's about, so you get a clean summary instead of a bare unknown number.
- Strangers are also capped at `MAX_REPLIES_PER_CHAT_PER_DAY` (default 10) assistant replies per day, so a junk number can't burn your free Gemini quota. People listed explicitly in `ALLOWLIST` are never capped or intaked.
- Everything else - groups, unknown contacts, unsupported message types - is ignored or just logged.

## Requirements

- A **computer** with Node.js 22 or newer (`node --version`), **or** an **Android phone** with Termux (free - see the phone section)
- A free Google AI Studio API key: https://aistudio.google.com/apikey
- The phone with your WhatsApp account

## Run it on a computer

1. Install dependencies:

   ```
   npm install
   ```

2. Create your settings file:

   ```
   cp .env.example .env
   ```

   Open `.env` and fill in:
   - `GEMINI_API_KEY` - your key from Google AI Studio
   - `ALLOWLIST` - contacts the bot may reply to (full international numbers, no `+`, e.g. `2348012345678`; or exact chat IDs from the log)
   - Leave `AUTO_REPLY=false` for now

3. Start it:

   ```
   npm start
   ```

4. A QR code appears in the terminal. On your phone: **WhatsApp -> Settings -> Linked devices -> Link a device**, and scan it. Wait for "Connected."

## Run it on a phone (keeps working when your computer is off)

The bot can live on an Android phone in the free Termux app. On the same phone it links using an 8-digit pairing code - no QR code and no camera needed.

1. Install **Termux** from F-Droid: https://f-droid.org/packages/com.termux (the Play Store version is outdated). If the browser warns about installing an app, allow "install unknown apps" for it.
2. Open Termux, then paste this one line (long-press the screen -> Paste) and press Enter. If you are reading this on a computer, first send the line to yourself on WhatsApp, then copy it on the phone:

   ```
   curl -sL https://raw.githubusercontent.com/Sunnybie/whatsapp-assistant/main/setup-termux.sh | bash
   ```

   (If Termux says `curl: command not found`, run `pkg install -y curl` first, then the line again.)
3. Answer the two questions: your Gemini API key, and your own WhatsApp number (country code first, digits only, e.g. `2348012345678`).
4. The bot shows an **8-digit code**. On the same phone: **WhatsApp -> Settings -> Linked devices -> Link a device -> "Link with phone number instead"**, and enter the code.

Keeping it alive:

- Termux holds a wake-lock while the bot runs, so the screen turning off is fine.
- `run.sh` restarts the bot by itself if it ever stops on its own (a crash or network blip) - CTRL then C still stops it completely.
- Android settings for Termux: battery usage **Unrestricted**. On Tecno/Infinix/itel/Xiaomi/Oppo, also allow "auto-start" and lock Termux in the recent-apps screen so Android does not kill it.
- To have the bot start itself after a phone restart, install the **Termux:Boot** app from F-Droid (same source as Termux): https://f-droid.org/packages/com.termux.boot - the setup script already installed the boot entry; the boot script just runs `bash run.sh`.
- If the phone restarts and you don't use Termux:Boot, open Termux and run: `cd ~/whatsapp-assistant && bash run.sh`
- The 8-digit code expires after a few minutes. If you were too slow, stop the bot (Ctrl+C) and start it again for a fresh code.
- For the urgent-message flashlight alert, also install the **Termux:API** app from F-Droid (same source as Termux): https://f-droid.org/packages/com.termux.api

Phone helpers:

- Allow a contact: `cd ~/whatsapp-assistant && bash allow.sh 2348012345678`
- Turn on auto-replies after you have watched the logs (see below): `bash reply.sh on` (turn off again with `bash reply.sh off`)
- Get the latest version: `cd ~/whatsapp-assistant && bash update.sh`

## First run: watch before you reply

Start with `AUTO_REPLY=false`. The bot logs every incoming direct message but sends nothing:

```
[in] Tunde: Are you coming tomorrow?
[skip] new person (2348012345678@s.whatsapp.net) is not in ALLOWLIST - add "2348012345678" to .env to allow them
```

- Copy the numbers/IDs of the people you want handled into `ALLOWLIST` (on the phone: `bash allow.sh <number>`). People not on the list are never replied to.
- When the log looks right, set `AUTO_REPLY=true` and restart the bot. Now it replies.

## Making it sound right

Edit `instructions.md` - your name goes where it says `<YOUR NAME>`. The default rules make the assistant:

- reply as your assistant, in the sender's language, 1-3 short sentences
- never promise meetings, prices, payments, or deadlines
- never share personal or financial details
- fall back to "I'll pass this on" when unsure

Replies are generated by Google Gemini's free tier. The bot remembers the last `HISTORY_LIMIT` messages per chat (default 12) and saves them to `history.json`, so conversations survive restarts. The WhatsApp login lives in `auth_state/`.

## Important limits

- **Whichever device runs the bot (computer or phone) must stay on and online.** Close the terminal and it stops.
- **Reply-only.** No starting chats or groups. Voice notes are transcribed and photos get a short description; other media get an acknowledgment, but videos and documents are not read yet.
- Baileys is an unofficial library, so there is a small risk to the number. Keeping replies modest and limited to known contacts is the safest use. If WhatsApp ever logs the device out, the bot tells you; just link again.
- The bot only sees what WhatsApp sends to linked devices - messages you don't get notified about stay private to your phone.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No QR code shows | Wait 10-20 seconds. If it still doesn't appear, stop, delete the `auth_state` folder, and start again. |
| Pairing code not accepted or expired | Stop (Ctrl+C) and start again - a fresh code is issued. |
| "This device was logged out" | Delete the `auth_state` folder, start again, link again. |
| Only `[in]` logs, no replies | `AUTO_REPLY=false`, or the sender is not in `ALLOWLIST`. |
| Bot stops by itself on the phone | Android killed Termux: set battery to Unrestricted, allow auto-start, lock it in recent apps - then `bash run.sh`. |
| Gemini error 429 / quota | Free-tier limit reached. Wait, or set `AUTO_REPLY=false` to pause replies without stopping the bot. |
| `bash update.sh` says local changes would be overwritten | Run `git checkout -- .` then `git pull` once; after that, updated `update.sh` fixes this by itself. |
| Unlink the bot | WhatsApp -> Settings -> Linked devices -> remove the device. |

## Notes on privacy

The repo contains no keys and no personal data - those live only in `.env`, which is never uploaded. The one-line phone installer downloads from GitHub, so the repository must be **public** for that link to work (it already is if you're reading this there; make it public under Settings -> General -> Change visibility if needed).

## Ideas for later

- Videos and documents: read their content too.
