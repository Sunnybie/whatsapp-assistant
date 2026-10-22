import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import {
  MAX_HISTORY,
  buildContents,
  describeMedia,
  extractIncomingText,
  extractText,
  isAllowed,
  isDirectChat,
  isExplicitlyAllowed,
  isQuietTime,
  isUrgent,
  normalizeNumber,
  parseAllowList,
  parseQuietHours,
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
const HISTORY_LIMIT = Math.max(1, parseInt(process.env.HISTORY_LIMIT || String(MAX_HISTORY), 10) || MAX_HISTORY);
const HISTORY_FILE = path.join(here, 'history.json');
const QUIET_HOURS = parseQuietHours(process.env.QUIET_HOURS); // e.g. 23-7; unset or empty = no quiet hours
const REPLY_CAP = Math.max(0, parseInt(process.env.MAX_REPLIES_PER_CHAT_PER_DAY || '10', 10) || 0); // per stranger per day; 0 = no cap
const REPLY_COUNTS_FILE = path.join(here, 'reply-counts.json');

function loadHistory() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))));
  } catch {
    return new Map();
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(history)));
  } catch (err) {
    console.error(`[warn] could not save history: ${err.message || err}`);
  }
}

function loadReplyCounts() {
  try {
    return JSON.parse(fs.readFileSync(REPLY_COUNTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveReplyCounts() {
  try {
    fs.writeFileSync(REPLY_COUNTS_FILE, JSON.stringify(replyCounts));
  } catch (err) {
    console.error(`[warn] could not save reply counts: ${err.message || err}`);
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

if (AUTO_REPLY && !GEMINI_KEY) {
  console.error('AUTO_REPLY=true but GEMINI_API_KEY is not set. Put it in .env (copy .env.example).');
  process.exit(1);
}
if (AUTO_REPLY && allowList.size === 0) {
  console.warn('Warning: ALLOWLIST is empty, so no one can trigger a reply. Add contacts to .env and restart.');
}

const instructions = fs.readFileSync(path.join(here, 'instructions.md'), 'utf8');
const history = loadHistory();
const replyCounts = loadReplyCounts(); // chatId -> { date: 'YYYY-MM-DD', count }
const pending = new Map(); // chatId -> { timer, texts } while a burst is being collected

const INTAKE_INSTRUCTION = 'New contact protocol: this sender is a first-time contact whose number is not saved with us. '
  + 'Politely ask for their name and what their message is about, and say you will pass it on to Sunny. '
  + 'Do not answer their request beyond acknowledging it. Keep it to 2-3 short sentences.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// downloadMediaMessage wants a pino-like logger; this stub is enough
const silentLog = {
  level: 'silent',
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
  child() { return this; },
};

async function askGemini(hist, extraInstruction) {
  const systemText = extraInstruction ? `${instructions}\n\n${extraInstruction}` : instructions;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
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

async function askGeminiMedia(prompt, buf, mime) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: Buffer.from(buf).toString('base64') } }] }],
      generationConfig: {
        maxOutputTokens: 500,
        thinkingConfig: { includeThoughts: false, thinkingLevel: 'minimal' },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return extractText(await res.json());
}

// voice notes -> transcript, photos -> short description; null when it can't be done
async function understandMedia(message, name) {
  const msg = message.message ?? {};
  let prompt = null;
  let mime = null;
  if (msg.audioMessage) {
    prompt = 'Transcribe this voice message word for word. Output only the transcript text - no commentary, no quotes.';
    mime = msg.audioMessage.mimetype || 'audio/ogg';
  } else if (msg.imageMessage) {
    prompt = 'Describe this image in one or two short sentences, as if telling someone what they just received.';
    mime = msg.imageMessage.mimetype || 'image/jpeg';
  }
  if (!prompt || !GEMINI_KEY) return null;
  try {
    const buf = await downloadMediaMessage(message, 'buffer', {}, { logger: silentLog });
    const reply = await askGeminiMedia(prompt, buf, mime);
    if (!reply) return null;
    return msg.audioMessage ? `[voice note from ${name}]: ${reply}` : `[photo from ${name}]: ${reply}`;
  } catch (err) {
    console.log(`[warn] could not understand media from ${name}: ${err.message || err}`);
    return null;
  }
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
      const quiet = AUTO_REPLY && QUIET_HOURS ? `, quiet hours ${QUIET_HOURS.start}:00-${QUIET_HOURS.end}:00` : '';
      console.log(`\nConnected. Waiting for messages. Mode: ${AUTO_REPLY ? 'AUTO-REPLY ON' : 'watch only (nothing will be sent)'}${quiet}.`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        // the server killed this session; without wiping, the saved creds still say
        // "registered" and every restart retries the dead session instead of pairing fresh
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.error('\nThis device was unlinked from WhatsApp (you may have removed it in Linked devices). Run "bash run.sh" and link again with the new code.');
        process.exit(1);
      }
      console.log(`Connection closed (${code ?? 'unknown'}). Reconnecting in 3 seconds...`);
      setTimeout(() => connect().catch((err) => console.error('Reconnect failed:', err.message || err)), 3000);
    }
  });

  async function replyToChat(chatId, name, text, isStranger) {
    if (isStranger && REPLY_CAP > 0) {
      const key = todayKey();
      const rec = replyCounts[chatId];
      const used = rec && rec.date === key ? rec.count : 0;
      if (used >= REPLY_CAP) {
        console.log(`[skip] ${name}: daily reply cap reached for strangers (${used}/${REPLY_CAP}) - no more replies to this number today`);
        return;
      }
    }

    const hist = history.get(chatId) ?? [];
    pushCapped(hist, { role: 'user', text }, HISTORY_LIMIT);
    const firstContact = isStranger && !hist.some((e) => e.role === 'model');
    const reply = await askGemini(hist, firstContact ? INTAKE_INSTRUCTION : undefined);
    await sleep(800 + Math.random() * 1700);
    await sock.sendMessage(chatId, { text: reply });

    if (isStranger && REPLY_CAP > 0) {
      const key = todayKey();
      const rec = replyCounts[chatId];
      replyCounts[chatId] = { date: key, count: rec && rec.date === key ? rec.count + 1 : 1 };
      saveReplyCounts();
    }

    pushCapped(hist, { role: 'model', text: reply }, HISTORY_LIMIT);
    history.set(chatId, hist);
    saveHistory();
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
        // with ALLOWLIST=* everyone is allowed; a "stranger" is anyone not listed
        // explicitly - strangers get the daily reply cap and the intake treatment
        const isStranger = allowList.has('*')
          && !isExplicitlyAllowed(chatId, allowList)
          && !isExplicitlyAllowed(message.key?.senderPn || '', allowList);

        let text = extractIncomingText(message.message);
        if (!text) {
          text = await understandMedia(message, name);
        }
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

        // urgent messages reach Sunny directly: local notification + flashlight on the
        // phone running the bot (no WhatsApp decryption involved), plus a copy to his
        // own chat as a record - that copy can occasionally stick as "Waiting for this
        // message" on the phone, which is why the local alert is the primary channel
        if (AUTO_REPLY && chatId !== SUNNY_JID && isUrgent(text)) {
          if (SUNNY_JID) {
            await sock.sendMessage(SUNNY_JID, { text: `Urgent message from ${name} (${user}):\n\n${text}` });
          }
          spawn('bash', [path.join(here, 'flash.sh'), name, text], { stdio: 'inherit' }).unref();
          console.log(`[alert] urgent message from ${name} - notification sent, phone flashing (press Enter in Termux to stop)`);
        }

        if (!AUTO_REPLY) continue;

        // quiet hours: save the message to memory so the next reply has context,
        // but stay silent - urgent alerts above still fire at any hour
        if (isQuietTime(QUIET_HOURS)) {
          const hist = history.get(chatId) ?? [];
          pushCapped(hist, { role: 'user', text }, HISTORY_LIMIT);
          history.set(chatId, hist);
          saveHistory();
          console.log(`[skip] quiet hours (${QUIET_HOURS.start}:00-${QUIET_HOURS.end}:00) - saved for later, no reply sent`);
          continue;
        }

        // collect message bursts and answer once, REPLY_DELAY_MS after the last one
        const entry = pending.get(chatId) ?? { timer: null, texts: [] };
        entry.texts.push(text);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          pending.delete(chatId);
          const combined = entry.texts.join('\n');
          replyToChat(chatId, name, combined, isStranger).catch((err) =>
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
