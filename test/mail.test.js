import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { runTool, toolDefinitions } from '../lib/tools.js';
import { isImportant, checkMail, mailConfigFromEnv, callText, placeCall } from '../lib/mail.js';

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

const callCfg = { sid: 'AC1', token: 'tok', from: '+4930111', to: '+49170222' };

test('Konfiguration: Anruf allein reicht, ohne Meldeweg ist die Überwachung aus', () => {
  const base = { IMAP_HOST: 'h', IMAP_USER: 'u', IMAP_PASSWORD: 'p' };
  assert.equal(mailConfigFromEnv(base), null);
  assert.equal(mailConfigFromEnv({ ...base, TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b' }), null);
  const c = mailConfigFromEnv({ ...base, TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', TWILIO_FROM: '+1', CALL_TO: '+2' });
  assert.equal(c.ntfy, null);
  assert.equal(c.call.to, '+2');
});

test('Anruftext nennt Namen, Absender und je nach Einstellung den Betreff', () => {
  const one = [{ fromName: 'Finanzamt', subject: 'Bescheid' }];
  assert.equal(callText({ userName: 'Augustin', important: one, includeSubject: true }), 'Augustin, du hast eine wichtige E-Mail von Finanzamt. Betreff: Bescheid.');
  assert.ok(!callText({ userName: 'Augustin', important: one, includeSubject: false }).includes('Bescheid'));
  assert.match(callText({ userName: 'A', important: [...one, ...one], includeSubject: false }), /2 wichtige E-Mails/);
});

test('placeCall: Twilio-Anfrage mit Basic-Auth und maskiertem Text', async () => {
  let seen;
  await placeCall({ call: callCfg, text: 'Max <b> & Co', fetchFn: async (url, init) => { seen = { url, init }; return { ok: true }; } });
  assert.match(seen.url, /Accounts\/AC1\/Calls\.json$/);
  assert.equal(seen.init.headers.Authorization, 'Basic ' + Buffer.from('AC1:tok').toString('base64'));
  const body = new URLSearchParams(seen.init.body);
  assert.equal(body.get('To'), '+49170222');
  assert.ok(body.get('Twiml').includes('Max &lt;b&gt; &amp; Co'));
  await assert.rejects(placeCall({ call: callCfg, text: 'x', fetchFn: async () => ({ ok: false, status: 401 }) }), /401/);
});

test('Anruf: ein Anruf pro Durchlauf, danach Pause; ohne ntfy bleibt bei Fehler die Mail offen', async () => {
  const store = new Store(null); store.data.mailLastUid = 5;
  const calls = []; let t = 1000;
  const cfg = { ...config, ntfy: null, call: callCfg, callCooldownSeconds: 300, userName: 'Augustin' };
  const state = {};
  const mails = (...m) => async () => ({ messages: m });
  const call = async (c) => { calls.push(c.text); };

  await checkMail({ store, config: cfg, state, call, now: () => t, fetchNew: mails(msg(6, 'Finanzamt', 'a'), msg(7, 'Finanzamt', 'b')) });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /2 wichtige/);
  assert.equal(store.data.mailLastUid, 7);

  t += 60_000;   // innerhalb der Pause: kein zweiter Anruf
  await checkMail({ store, config: cfg, state, call, now: () => t, fetchNew: mails(msg(8, 'Finanzamt', 'c')) });
  assert.equal(calls.length, 1);

  t += 400_000;  // Pause vorbei
  await checkMail({ store, config: cfg, state, call, now: () => t, fetchNew: mails(msg(9, 'Finanzamt', 'd')) });
  assert.equal(calls.length, 2);

  await assert.rejects(checkMail({ store, config: cfg, state: {}, call: async () => { throw new Error('Twilio down'); }, fetchNew: mails(msg(10, 'Finanzamt', 'e')) }));
  assert.equal(store.data.mailLastUid, 9);
});

test('Push und Anruf zusammen: klappt einer, gilt die Mail als gemeldet', async () => {
  const store = new Store(null); store.data.mailLastUid = 1;
  const cfg = { ...config, call: callCfg, userName: 'Augustin' };
  const pushes = [];
  await checkMail({ store, config: cfg, state: {}, push: async (p) => pushes.push(p), call: async () => { throw new Error('x'); },
    fetchNew: async () => ({ messages: [msg(2, 'Finanzamt', 'a')] }) });
  assert.equal(pushes.length, 1);
  assert.equal(store.data.mailLastUid, 2);
});
