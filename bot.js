import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import {
  buildContents,
  describeMedia,
  extractIncomingText,
  extractText,
  isAllowed,
  isDirectChat,
  isUrgent,
  normalizeNumber,
  parseAllowList,
  pushCapped,
} from './lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(here, 'auth_state');
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const AUTO_REPLY = String(process.env.AUTO_REPLY || 'false').toLowerCase() === 'true';
const allowList = parseAllowList(process.env.ALLOWLIST);
const PAIRING_NUMBER = normalizeNumber(process.env.PAIRING_NUMBER || '');
const SUNNY_JID = PAIRING_NUMBER ? `${PAIRING_NUMBER}@s.whatsapp.net` : '';
const REPLY_DELAY_MS = Math.max(1, parseInt(process.env.REPLY_DELAY_SECONDS || '10', 10) || 10) * 1000;

if (AUTO_REPLY && !GEMINI_KEY) {
  console.error('AUTO_REPLY=true but GEMINI_API_KEY is not set. Put it in .env (copy .env.example).');
  process.exit(1);
}
if (AUTO_REPLY && allowList.size === 0) {
  console.warn('Warning: ALLOWLIST is empty, so no one can trigger a reply. Add contacts to .env and restart.');
}

const instructions = fs.readFileSync(path.join(here, 'instructions.md'), 'utf8');
const history = new Map();
const pending = new Map(); // chatId -> { timer, texts } while a burst is being collected

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function askGemini(hist) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: buildContents(hist),
      generationConfig: {
        maxOutputTokens: 500,
        thinkingConfig: { includeThoughts: false, thinkingLevel: 'minimal' },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const text = extractText(await res.json());
  if (!text) throw new Error('Gemini returned no text (blocked or empty).');
  return text;
}

async function connect() {
  let { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  if (!state.creds.registered) {
    // a failed/timed-out pairing already saved our number into creds.me; without wiping,
    // the next attempt logs in as a ghost device and WhatsApp reports "logged out"
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    ({ state, saveCreds } = await useMultiFileAuthState(AUTH_DIR));
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

  const sock = makeWASocket({ auth: state, version });
  let pairingRequested = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (PAIRING_NUMBER && !sock.authState.creds.registered) {
        if (pairingRequested) return; // code already printed - ignore QR refreshes
        pairingRequested = true;
        try {
          const code = await sock.requestPairingCode(PAIRING_NUMBER);
          console.log('\n========================================');
          console.log('  PAIRING CODE - enter it in WhatsApp NOW');
          console.log('  Settings -> Linked devices -> Link a device');
          console.log('  -> "Link with phone number instead"');
          console.log(`           ${code}`);
          console.log('========================================\n');
          return;
        } catch (err) {
          console.error('Pairing code request failed, using the QR code instead:', err.message || err);
        }
      }
      console.log('\nScan this QR code with WhatsApp on your phone:');
      console.log('WhatsApp -> Settings -> Linked devices -> Link a device\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log(`\nConnected. Waiting for messages. Mode: ${AUTO_REPLY ? 'AUTO-REPLY ON' : 'watch only (nothing will be sent)'}.`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('\nThis device was unlinked from WhatsApp (you may have removed it in Linked devices). Run "bash run.sh" and link again with the new code.');
        process.exit(1);
      }
      console.log(`Connection closed (${code ?? 'unknown'}). Reconnecting in 3 seconds...`);
      setTimeout(() => connect().catch((err) => console.error('Reconnect failed:', err.message || err)), 3000);
    }
  });

  async function replyToChat(chatId, name, text) {
    const hist = history.get(chatId) ?? [];
    pushCapped(hist, { role: 'user', text });
    const reply = await askGemini(hist);
    await sleep(800 + Math.random() * 1700);
    await sock.sendMessage(chatId, { text: reply });
    pushCapped(hist, { role: 'model', text: reply });
    history.set(chatId, hist);
    console.log(`[out] ${name}: ${reply}`);
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      try {
        if (message.key?.fromMe) continue;
        const chatId = message.key?.remoteJid || '';
        if (!isDirectChat(chatId)) continue;

        const name = message.pushName || 'unknown';
        const user = chatId.split('@')[0].split(':')[0];

        // WhatsApp routes many chats via privacy IDs (...@lid); match the allowlist
        // against the sender's real phone number (senderPn) too, not just the chat id
        if (!isAllowed(chatId, allowList) && !isAllowed(message.key?.senderPn || '', allowList)) {
          console.log(`[skip] ${name} (${chatId}) is not in ALLOWLIST - add "${user}" to .env to allow them`);
          continue;
        }

        let text = extractIncomingText(message.message);
        if (!text) {
          const media = describeMedia(message.message);
          if (!media) {
            console.log(`[skip] ${name}: unsupported message type`);
            continue;
          }
          text = `[${name} sent ${media}]`;
          console.log(`[in] ${name}: ${media} (no caption)`);
        } else {
          console.log(`[in] ${name}: ${text}`);
        }

        // urgent messages are copied to Sunny's own chat so they reach him even while away
        if (AUTO_REPLY && SUNNY_JID && chatId !== SUNNY_JID && isUrgent(text)) {
          await sock.sendMessage(SUNNY_JID, { text: `Urgent message from ${name} (${user}):\n\n${text}` });
          console.log(`[alert] urgent message from ${name} forwarded to Sunny`);
        }

        if (!AUTO_REPLY) continue;

        // collect message bursts and answer once, REPLY_DELAY_MS after the last one
        const entry = pending.get(chatId) ?? { timer: null, texts: [] };
        entry.texts.push(text);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          pending.delete(chatId);
          const combined = entry.texts.join('\n');
          replyToChat(chatId, name, combined).catch((err) =>
            console.error(`[error] ${chatId}: ${err.message || err}`));
        }, REPLY_DELAY_MS);
        pending.set(chatId, entry);
      } catch (err) {
        console.error(`[error] ${message.key?.remoteJid ?? 'unknown'}: ${err.message || err}`);
      }
    }
  });
}

console.log(`Starting WhatsApp assistant. Mode: ${AUTO_REPLY ? 'auto-reply' : 'watch only'}.`);
connect().catch((err) => {
  console.error('Failed to start:', err.message || err);
  process.exit(1);
});
