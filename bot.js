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
  extractIncomingText,
  extractText,
  isAllowed,
  isDirectChat,
  parseAllowList,
  pushCapped,
} from './lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const AUTO_REPLY = String(process.env.AUTO_REPLY || 'false').toLowerCase() === 'true';
const allowList = parseAllowList(process.env.ALLOWLIST);

if (AUTO_REPLY && !GEMINI_KEY) {
  console.error('AUTO_REPLY=true but GEMINI_API_KEY is not set. Put it in .env (copy .env.example).');
  process.exit(1);
}
if (AUTO_REPLY && allowList.size === 0) {
  console.warn('Warning: ALLOWLIST is empty, so no one can trigger a reply. Add contacts to .env and restart.');
}

const instructions = fs.readFileSync(path.join(here, 'instructions.md'), 'utf8');
const history = new Map();

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
  const { state, saveCreds } = await useMultiFileAuthState(path.join(here, 'auth_state'));

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined;
  }

  const sock = makeWASocket({ auth: state, version });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
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
        console.error('\nThis device was logged out of WhatsApp. Delete the "auth_state" folder, start again, and scan the new QR code.');
        process.exit(1);
      }
      console.log(`Connection closed (${code ?? 'unknown'}). Reconnecting in 3 seconds...`);
      setTimeout(() => connect().catch((err) => console.error('Reconnect failed:', err.message || err)), 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      try {
        if (message.key?.fromMe) continue;
        const chatId = message.key?.remoteJid || '';
        if (!isDirectChat(chatId)) continue;

        const name = message.pushName || 'unknown';
        const user = chatId.split('@')[0].split(':')[0];

        if (!isAllowed(chatId, allowList)) {
          console.log(`[skip] ${name} (${chatId}) is not in ALLOWLIST - add "${user}" to .env to allow them`);
          continue;
        }

        const text = extractIncomingText(message.message);
        if (!text) {
          console.log(`[skip] ${name}: message has no text (voice notes and media without captions are not supported yet)`);
          continue;
        }

        console.log(`[in] ${name}: ${text}`);
        const hist = history.get(chatId) ?? [];
        pushCapped(hist, { role: 'user', text });
        history.set(chatId, hist);

        if (!AUTO_REPLY) continue;

        const reply = await askGemini(hist);
        await sleep(800 + Math.random() * 1700);
        await sock.sendMessage(chatId, { text: reply });
        pushCapped(hist, { role: 'model', text: reply });
        console.log(`[out] ${name}: ${reply}`);
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
