import assert from 'node:assert/strict';
import {
  MAX_HISTORY,
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

assert.equal(normalizeNumber('+234 801-234 5678'), '2348012345678');
assert.equal(normalizeNumber(undefined), '');
assert.equal(normalizeNumber('abc'), '');

const list = parseAllowList('2348012345678, +234 802 000 0000, junk entry!!, *, 123@lid, 555:12@s.whatsapp.net');
assert.equal(list.size, 5);
assert.ok(list.has('2348012345678'));
assert.ok(list.has('2348020000000'));
assert.ok(list.has('*'));
assert.ok(list.has('123'));
assert.ok(list.has('555'));
assert.equal(parseAllowList('').size, 0);
assert.equal(parseAllowList(undefined).size, 0);

const allow = parseAllowList('2348012345678');
assert.equal(isAllowed('2348012345678@s.whatsapp.net', allow), true);
assert.equal(isAllowed('2348012345678:12@s.whatsapp.net', allow), true);
assert.equal(isAllowed('2348099999999@s.whatsapp.net', allow), false);
assert.equal(isAllowed('2348012345678@s.whatsapp.net', new Set()), false);
assert.equal(isAllowed('999@s.whatsapp.net', new Set(['*'])), true);
assert.equal(isAllowed('123@lid', parseAllowList('123@lid')), true);

assert.equal(isDirectChat('2348012345678@s.whatsapp.net'), true);
assert.equal(isDirectChat('123@lid'), true);
assert.equal(isDirectChat('123-456@g.us'), false);
assert.equal(isDirectChat('status@broadcast'), false);
assert.equal(isDirectChat(''), false);

assert.equal(extractIncomingText({ conversation: 'hello' }), 'hello');
assert.equal(extractIncomingText({ extendedTextMessage: { text: 'hi' } }), 'hi');
assert.equal(extractIncomingText({ imageMessage: { caption: 'look' } }), 'look');
assert.equal(extractIncomingText({ videoMessage: { caption: 'vid' } }), 'vid');
assert.equal(extractIncomingText({ ephemeralMessage: { message: { conversation: 'secret' } } }), 'secret');
assert.equal(extractIncomingText({ viewOnceMessageV2: { message: { extendedTextMessage: { text: 'once' } } } }), 'once');
assert.equal(extractIncomingText({ imageMessage: {} }), null);
assert.equal(extractIncomingText(null), null);

assert.equal(describeMedia({ imageMessage: {} }), 'a photo');
assert.equal(describeMedia({ videoMessage: {} }), 'a video');
assert.equal(describeMedia({ audioMessage: { ptt: true } }), 'a voice note');
assert.equal(describeMedia({ audioMessage: { ptt: false } }), 'an audio file');
assert.equal(describeMedia({ documentMessage: {} }), 'a document');
assert.equal(describeMedia({ conversation: 'hi' }), null);
assert.equal(describeMedia(null), null);

assert.equal(isUrgent('This is urgent please'), true);
assert.equal(isUrgent('URGENT!!!'), true);
assert.equal(isUrgent('it is an emergency'), true);
assert.equal(isUrgent('reply asap'), true);
assert.equal(isUrgent('hello, how are you'), false);

const hist = [];
for (let i = 0; i < 20; i++) pushCapped(hist, { role: 'user', text: `m${i}` });
assert.equal(hist.length, MAX_HISTORY);
assert.equal(hist[0].text, 'm8');
assert.equal(hist[hist.length - 1].text, 'm19');

assert.deepEqual(buildContents([{ role: 'user', text: 'a' }, { role: 'model', text: 'b' }]), [
  { role: 'user', parts: [{ text: 'a' }] },
  { role: 'model', parts: [{ text: 'b' }] },
]);

assert.equal(extractText({ candidates: [{ content: { parts: [{ text: 'Hel' }, { text: 'lo' }] } }] }), 'Hello');
assert.equal(extractText({ candidates: [{ content: { parts: [{ thought: true, text: 'hmm' }, { text: 'Reply' }] } }] }), 'Reply');
assert.equal(extractText({}), '');
assert.equal(extractText({ candidates: [] }), '');

console.log('All tests passed');
