export const MAX_HISTORY = 12;

export function normalizeNumber(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function parseAllowList(raw) {
  const set = new Set();
  for (const part of String(raw ?? '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t === '*') {
      set.add('*');
    } else if (t.includes('@')) {
      const user = t.split('@')[0].split(':')[0].toLowerCase();
      if (user) set.add(user);
    } else {
      const digits = normalizeNumber(t);
      if (digits) set.add(digits);
    }
  }
  return set;
}

export function isAllowed(jid, allowList) {
  if (!allowList || allowList.size === 0) return false;
  if (allowList.has('*')) return true;
  return isExplicitlyAllowed(jid, allowList);
}

// same matching as isAllowed but never matches the '*' wildcard,
// so the bot can tell "explicitly trusted contact" from "allowed because *"
export function isExplicitlyAllowed(jid, allowList) {
  if (!allowList || allowList.size === 0) return false;
  const user = String(jid ?? '').split('@')[0].split(':')[0];
  if (allowList.has(user)) return true;
  const digits = normalizeNumber(user);
  return digits !== '' && allowList.has(digits);
}

// "23-7" -> { start: 23, end: 7 }; null when unset or malformed (start === end means disabled)
export function parseQuietHours(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (start < 0 || start > 23 || end < 0 || end > 23 || start === end) return null;
  return { start, end };
}

export function isQuietTime(qh, date = new Date()) {
  if (!qh) return false;
  const h = date.getHours();
  if (qh.start < qh.end) return h >= qh.start && h < qh.end;
  return h >= qh.start || h < qh.end; // overnight window like 23-7
}

export function isDirectChat(jid) {
  const s = String(jid ?? '');
  return s.endsWith('@s.whatsapp.net') || s.endsWith('@lid');
}

export function extractIncomingText(message) {
  let msg = message;
  if (!msg) return null;
  if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
  if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
  if (msg.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    null
  );
}

export function describeMedia(message) {
  const msg = message ?? {};
  if (msg.audioMessage) return msg.audioMessage.ptt ? 'a voice note' : 'an audio file';
  if (msg.imageMessage) return 'a photo';
  if (msg.videoMessage) return 'a video';
  if (msg.documentMessage) return 'a document';
  if (msg.stickerMessage) return 'a sticker';
  return null;
}

export function isUrgent(text) {
  return /\b(urgent|urgently|emergency|asap)\b/i.test(String(text ?? ''));
}

export function pushCapped(history, entry, max = MAX_HISTORY) {
  history.push(entry);
  while (history.length > max) history.shift();
  return history;
}

export function buildContents(history) {
  return history.map(({ role, text }) => ({ role, parts: [{ text }] }));
}

export function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}
