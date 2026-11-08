import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/wake.js';

const find = globalThis.findWake;
const cmdAfter = (t) => { const m = find(t); return m ? t.slice(m.end).replace(/^[\s,.:!?-]+/, '') : null; };

test('Typische Schreibweisen von "Jarvis" werden erkannt', () => {
  for (const t of ['Hey Jarvis', 'hey Jarvis', 'Hey, Jarvis!', 'Hej Dscharwis', 'Hey Tscharvis', 'hey Charvis', 'Hey Garvis', 'Hey Jarwis',
    'Hey Jar vis', 'hey dschar wis', 'Hey Gervais', 'Jarvis', 'Hey Scharvis', 'hey Jarvies', 'Hey JARVIS']) {
    assert.ok(find(t), `"${t}" sollte erkannt werden`);
  }
});

test('Ähnliche Wörter ohne "Jarvis" werden nicht erkannt', () => {
  for (const t of ['Hey Travis wie geht es dir', 'Das Service war gut', 'Wir fahren nach Harris', 'Hey Davis', 'Ich war im Garten', 'Hallo Augustin',
    'Hey Google', 'Hey Siri', 'Hey Mycroft', 'Gar nicht', 'Schweiz', 'Marvis Zahnpasta']) {
    assert.equal(find(t), null, `"${t}" darf nicht erkannt werden`);
  }
});

test('Alles nach dem Wake-Word ist der Befehl', () => {
  assert.equal(cmdAfter('Hey Jarvis wie spät ist es'), 'wie spät ist es');
  assert.equal(cmdAfter('Hej Dscharwis, mach das Licht an.'), 'mach das Licht an.');
  assert.equal(cmdAfter('hey jar vis was ist das'), 'was ist das');
  assert.equal(cmdAfter('Hey Jarvis'), '');
  assert.equal(cmdAfter('Ich möchte, dass Garvis das Wetter sagt'), 'das Wetter sagt');
});
