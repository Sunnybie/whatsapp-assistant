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
  const user = String(jid ?? '').split('@')[0].split(':')[0];
  if (allowList.has(user)) return true;
  const digits = normalizeNumber(user);
  return digits !== '' && allowList.has(digits);
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
