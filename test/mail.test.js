import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { runTool, toolDefinitions } from '../lib/tools.js';
import { isImportant, checkMail, mailConfigFromEnv } from '../lib/mail.js';

const config = {
  imap: {}, ntfy: { server: 'https://ntfy.example', topic: 't' }, includeSubject: true,
  defaults: { senders: ['finanzamt'], keywords: ['dringend'] },
};
const msg = (uid, fromName, subject, fromAddress = 'x@y.de') => ({ uid, fromName, fromAddress, subject });

test('Konfiguration nur, wenn alle vier Variablen gesetzt sind', () => {
  assert.equal(mailConfigFromEnv({ IMAP_HOST: 'h', IMAP_USER: 'u', IMAP_PASSWORD: 'p' }), null);
  const c = mailConfigFromEnv({ IMAP_HOST: 'h', IMAP_USER: 'u', IMAP_PASSWORD: 'p', NTFY_TOPIC: 't', MAIL_IMPORTANT_SENDERS: 'a, b' });
  assert.deepEqual(c.defaults.senders, ['a', 'b']);
  assert.equal(c.imap.port, 993);
});

test('isImportant: Absender und Betreff, Groß-/Kleinschreibung egal, leere Filter melden nichts', () => {
  const f = { senders: ['Finanzamt'], keywords: ['dringend'] };
  assert.ok(isImportant(msg(1, 'Finanzamt Würzburg', 'Bescheid'), f));
  assert.ok(isImportant(msg(2, 'Max', 'DRINGEND: Rückruf'), f));
  assert.ok(!isImportant(msg(3, 'Newsletter', 'Angebote'), f));
  assert.ok(!isImportant(msg(4, 'Finanzamt', 'x'), { senders: [], keywords: [] }));
});

test('Erster Lauf setzt nur die Basis, danach gibt es Pushes nur für wichtige neue Mails', async () => {
  const store = new Store(null);
  const pushes = [];
  const push = async (p) => { pushes.push(p); };

  await checkMail({ store, config, fetchNew: async ({ lastUid }) => { assert.equal(lastUid, null); return { baseline: 100, messages: [] }; }, push });
  assert.equal(store.data.mailLastUid, 100);
  assert.equal(pushes.length, 0);

  const sent = await checkMail({ store, config, push, fetchNew: async ({ lastUid }) => {
    assert.equal(lastUid, 100);
    return { messages: [msg(102, 'Finanzamt', 'Bescheid'), msg(101, 'Shop', 'Angebote'), msg(103, 'Chef', 'dringend')] };
  } });
  assert.equal(sent, 2);
  assert.equal(store.data.mailLastUid, 103);
  assert.match(pushes[0].title, /Finanzamt/);
  assert.equal(pushes[0].message, 'Bescheid');
});

test('Schlägt der Push fehl, bleibt die Mail für den nächsten Versuch offen', async () => {
  const store = new Store(null); store.data.mailLastUid = 10;
  const fetchNew = async () => ({ messages: [msg(11, 'Finanzamt', 'a'), msg(12, 'Finanzamt', 'b')] });
  await assert.rejects(checkMail({ store, config, fetchNew, push: async () => { throw new Error('offline'); } }));
  assert.equal(store.data.mailLastUid, 10);
});

test('Ohne Betreff-Freigabe enthält der Push keinen Betreff', async () => {
  const store = new Store(null); store.data.mailLastUid = 1;
  const pushes = [];
  await checkMail({ store, config: { ...config, includeSubject: false }, push: async (p) => pushes.push(p),
    fetchNew: async () => ({ messages: [msg(2, 'Finanzamt', 'Geheimer Betreff')] }) });
  assert.ok(!pushes[0].message.includes('Geheimer'));
});

test('Werkzeuge: Filter setzen und lesen, nur mit aktivierter Mail-Überwachung sichtbar', async () => {
  const store = new Store(null);
  assert.ok(!toolDefinitions({ mailEnabled: false }).some(t => t.name === 'set_mail_filters'));
  assert.ok(toolDefinitions({ mailEnabled: true }).some(t => t.name === 'set_mail_filters'));
  await runTool(store, 'set_mail_filters', { senders: ['chef', ' chef ', ''], keywords: ['dringend'] });
  assert.deepEqual(store.data.mailFilters, { senders: ['chef'], keywords: ['dringend'] });
  assert.match(await runTool(store, 'get_mail_filters', {}), /chef/);
});
