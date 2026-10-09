/** Überwacht ein IMAP-Postfach und schickt bei wichtigen neuen Mails eine Push-Nachricht (ntfy). */

export function mailConfigFromEnv(env = process.env) {
  const need = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD', 'NTFY_TOPIC'];
  if (need.some(k => !env[k])) return null;
  const list = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    imap: { host: env.IMAP_HOST, port: Number(env.IMAP_PORT) || 993, user: env.IMAP_USER, password: env.IMAP_PASSWORD },
    ntfy: { server: (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, ''), topic: env.NTFY_TOPIC },
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

/** Ein Prüfdurchlauf. Gibt die Anzahl gesendeter Benachrichtigungen zurück. */
export async function checkMail({ store, config, fetchNew = fetchNewMessages, push = sendPush }) {
  const lastUid = store.data.mailLastUid ?? null;
  const result = await fetchNew({ imap: config.imap, lastUid });
  if (result.baseline != null) {
    store.data.mailLastUid = result.baseline; store.save();
    return 0;
  }
  const filters = getFilters(store, config);
  let sent = 0;
  let maxUid = lastUid;
  for (const msg of result.messages.sort((a, b) => a.uid - b.uid)) {
    if (isImportant(msg, filters)) {
      const who = msg.fromName || msg.fromAddress || 'Unbekannt';
      await push({
        ntfy: config.ntfy,
        title: `Wichtige Mail von ${who}`,
        message: config.includeSubject ? (msg.subject || '(kein Betreff)') : 'Neue wichtige Mail im Postfach',
      });
      sent++;
    }
    // UID erst nach erfolgreichem Versand vorrücken, damit nichts verloren geht
    maxUid = msg.uid;
    store.data.mailLastUid = maxUid; store.save();
  }
  return sent;
}

export function startMailWatcher({ store, config, fetchNew, push, log = console }) {
  getFilters(store, config); store.save();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await checkMail({ store, config, fetchNew, push }); }
    catch (err) { log.warn('Mail-Prüfung fehlgeschlagen:', err.message); }
    finally { running = false; }
  };
  tick();
  const timer = setInterval(tick, config.pollSeconds * 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}
