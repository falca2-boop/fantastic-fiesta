/**
 * Überwacht ein IMAP-Postfach und meldet wichtige neue Mails per Push (ntfy) und/oder Telefonanruf (Twilio).
 */

export function mailConfigFromEnv(env = process.env) {
  if (['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD'].some(k => !env[k])) return null;
  const hasCall = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'CALL_TO'].every(k => env[k]);
  if (!env.NTFY_TOPIC && !hasCall) return null;   // ohne Meldeweg bringt die Überwachung nichts
  const list = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    userName: env.JARVIS_USER_NAME || 'Augustin',
    imap: { host: env.IMAP_HOST, port: Number(env.IMAP_PORT) || 993, user: env.IMAP_USER, password: env.IMAP_PASSWORD },
    ntfy: env.NTFY_TOPIC ? { server: (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, ''), topic: env.NTFY_TOPIC } : null,
    call: hasCall ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM, to: env.CALL_TO } : null,
    callCooldownSeconds: Number(env.MAIL_CALL_MIN_INTERVAL_SECONDS) || 300,
    pollSeconds: Math.max(30, Number(env.MAIL_POLL_SECONDS) || 60),
    includeSubject: env.MAIL_ALERT_INCLUDE_SUBJECT !== 'false',
    defaults: { senders: list(env.MAIL_IMPORTANT_SENDERS), keywords: list(env.MAIL_IMPORTANT_KEYWORDS) },
  };
}

export function getFilters(store, config) {
  if (!store.data.mailFilters) store.data.mailFilters = { ...config.defaults };
  return store.data.mailFilters;
}

export function isImportant(msg, filters) {
  const from = `${msg.fromName || ''} ${msg.fromAddress || ''}`.toLowerCase();
  const subject = (msg.subject || '').toLowerCase();
  return (filters.senders || []).some(s => from.includes(s.toLowerCase()))
      || (filters.keywords || []).some(k => subject.includes(k.toLowerCase()));
}

/** Holt Mails mit UID > lastUid. Beim ersten Lauf (lastUid == null) wird nur die aktuelle Position gemerkt. */
export async function fetchNewMessages({ imap, lastUid }) {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({ host: imap.host, port: imap.port, secure: true, auth: { user: imap.user, pass: imap.password }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (lastUid == null) return { baseline: client.mailbox.uidNext - 1, messages: [] };
      const messages = [];
      // "N:*" liefert bei leerem Bereich die letzte Mail zurück, daher unten nach UID filtern
      for await (const m of client.fetch(`${lastUid + 1}:*`, { uid: true, envelope: true }, { uid: true })) {
        if (m.uid <= lastUid) continue;
        const from = m.envelope?.from?.[0] || {};
        messages.push({ uid: m.uid, fromName: from.name || '', fromAddress: from.address || '', subject: m.envelope?.subject || '' });
      }
      return { messages };
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}

export async function sendPush({ ntfy, title, message, fetchFn = fetch }) {
  const res = await fetchFn(ntfy.server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: ntfy.topic, title, message, priority: 5, tags: ['incoming_envelope'] }),
  });
  if (!res.ok) throw new Error('ntfy HTTP ' + res.status);
}

const xmlEscape = (t) => String(t).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

/** Text, den JARVIS am Telefon vorliest. */
export function callText({ userName, important, includeSubject }) {
  const last = important[important.length - 1];
  const who = last.fromName || last.fromAddress || 'einem unbekannten Absender';
  let text = important.length === 1
    ? `${userName}, du hast eine wichtige E-Mail von ${who}.`
    : `${userName}, du hast ${important.length} wichtige E-Mails. Die neueste ist von ${who}.`;
  if (includeSubject && last.subject) text += ` Betreff: ${last.subject}.`;
  return text.slice(0, 300);
}

/** Ruft per Twilio an und liest den Text vor. */
export async function placeCall({ call, text, fetchFn = fetch }) {
  const twiml = `<Response><Say language="de-DE" voice="Polly.Vicki">${xmlEscape(text)}</Say></Response>`;
  const res = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(call.sid)}/Calls.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${call.sid}:${call.token}`).toString('base64'),
    },
    body: new URLSearchParams({ To: call.to, From: call.from, Twiml: twiml }).toString(),
  });
  if (!res.ok) throw new Error('Twilio HTTP ' + res.status);
}

/** Ein Prüfdurchlauf. Gibt die Anzahl wichtiger Mails zurück, die gemeldet wurden. */
export async function checkMail({ store, config, fetchNew = fetchNewMessages, push = sendPush, call = placeCall, now = Date.now, state = {} }) {
  const lastUid = store.data.mailLastUid ?? null;
  const result = await fetchNew({ imap: config.imap, lastUid });
  if (result.baseline != null) {
    store.data.mailLastUid = result.baseline; store.save();
    return 0;
  }
  const filters = getFilters(store, config);
  const important = [];
  let maxUid = lastUid;
  for (const msg of result.messages.sort((a, b) => a.uid - b.uid)) {
    if (isImportant(msg, filters)) important.push(msg);
    maxUid = msg.uid;
  }
  if (!important.length) {
    if (maxUid !== lastUid) { store.data.mailLastUid = maxUid; store.save(); }
    return 0;
  }

  // Meldewege parallel; es reicht, wenn einer klappt. Schlagen alle fehl, bleibt die UID stehen (nächster Versuch).
  const jobs = [];
  if (config.ntfy) {
    for (const msg of important) {
      const who = msg.fromName || msg.fromAddress || 'Unbekannt';
      jobs.push(push({
        ntfy: config.ntfy,
        title: `Wichtige Mail von ${who}`,
        message: config.includeSubject ? (msg.subject || '(kein Betreff)') : 'Neue wichtige Mail im Postfach',
      }));
    }
  }
  const cooldownMs = (config.callCooldownSeconds ?? 300) * 1000;
  const callDue = config.call && (state.lastCallAt == null || now() - state.lastCallAt >= cooldownMs);
  if (callDue) {
    jobs.push(call({ call: config.call, text: callText({ userName: config.userName || 'Augustin', important, includeSubject: config.includeSubject }) })
      .then(() => { state.lastCallAt = now(); }));
  }
  if (!jobs.length) {
    // nur Anruf konfiguriert und gerade Pause: Mails als gemeldet betrachten, ein Anruf pro Zeitfenster genügt
    store.data.mailLastUid = maxUid; store.save();
    return important.length;
  }
  const outcomes = await Promise.allSettled(jobs);
  if (outcomes.every(o => o.status === 'rejected')) throw outcomes[0].reason;
  store.data.mailLastUid = maxUid; store.save();
  return important.length;
}

export function startMailWatcher({ store, config, fetchNew, push, call, log = console }) {
  getFilters(store, config); store.save();
  let running = false;
  const state = {};
  const tick = async () => {
    if (running) return;
    running = true;
    try { await checkMail({ store, config, fetchNew, push, call, state }); }
    catch (err) { log.warn('Mail-Prüfung fehlgeschlagen:', err.message); }
    finally { running = false; }
  };
  tick();
  const timer = setInterval(tick, config.pollSeconds * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
