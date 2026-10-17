# Changelog

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
