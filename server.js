import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Store } from './lib/store.js';
import { chat, AgentError } from './lib/agent.js';
import { takeDueReminders } from './lib/tools.js';
import { mailConfigFromEnv, startMailWatcher, sendPush } from './lib/mail.js';
import { startResearch, takeFinishedJobs, recoverJobs } from './lib/jobs.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const isLoopback = (h) => ['127.0.0.1', '::1', 'localhost'].includes(h);

export function createServer(opts = {}) {
  const env = process.env;
  const cfg = {
    apiKey: opts.apiKey ?? env.ANTHROPIC_API_KEY ?? '',
    token: opts.token ?? env.JARVIS_TOKEN ?? '',
    model: opts.model ?? env.JARVIS_MODEL ?? 'claude-haiku-5-5',
    userName: opts.userName ?? env.JARVIS_USER_NAME ?? 'Augustin',
    webhookUrl: opts.webhookUrl ?? env.N8N_WEBHOOK_URL ?? '',
    fetchFn: opts.fetchFn ?? fetch,
    researchModel: opts.researchModel ?? env.JARVIS_RESEARCH_MODEL ?? 'claude-sonnet-5-5',
    ntfy: opts.ntfy === undefined
      ? (env.NTFY_TOPIC ? { server: (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, ''), topic: env.NTFY_TOPIC } : null)
      : opts.ntfy,
    jobPushIncludesResult: opts.jobPushIncludesResult ?? (env.JOB_PUSH_INCLUDE_RESULT === 'true'),
    mail: opts.mail === undefined ? mailConfigFromEnv(env) : opts.mail,
    voice: opts.voice === undefined
      ? (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
          ? { apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, model: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' }
          : null)
      : opts.voice,
  };
  const store = opts.store ?? new Store(path.join(env.DATA_DIR || path.join(ROOT, 'data'), 'store.json'), {
    remote: env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN } : null,
  });

  const authorized = (req) => {
    if (!cfg.token) return true;               // nur erlaubt, wenn der Server lokal bindet (siehe main)
    const header = req.headers.authorization || '';
    const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    const want = Buffer.from(cfg.token);
    return given.length === want.length && timingSafeEqual(given, want);
  };

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req, limit = 64 * 1024) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new AgentError('Anfrage zu groß', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  const publicState = () => {
    const d = store.data;
    return {
      userName: cfg.userName,
      goal: d.goal,
      factCount: d.facts.length,
      facts: d.facts.slice(-4),
      tasks: d.tasks.filter(t => !t.done).map(({ id, text, due }) => ({ id, text, due })),
      links: d.links.map(({ name, url }) => ({ name, url })),
      jobs: d.jobs.filter(j => j.status === 'running').map(j => j.title),
      reminders: d.reminders.filter(r => !r.fired).sort((a, b) => new Date(a.at) - new Date(b.at)).map(({ id, text, at }) => ({ id, text, at })),
    };
  };

  recoverJobs(store);
  const notifyJob = async (job) => {
    if (!cfg.ntfy) return;
    const ok = job.status === 'done';
    await sendPush({
      ntfy: cfg.ntfy,
      title: ok ? 'Recherche fertig' : 'Recherche fehlgeschlagen',
      message: ok && cfg.jobPushIncludesResult ? job.result.slice(0, 300) : job.title,
      fetchFn: cfg.fetchFn,
    });
  };
  const startJob = (request) => startResearch({ store, request, apiKey: cfg.apiKey, model: cfg.researchModel, fetchFn: cfg.fetchFn, notify: notifyJob });

  // Klartext-Übersicht für den Nutzer: was ist eingerichtet, was fehlt (ohne Geheimnisse preiszugeben)
  const systemStatus = () => {
    const line = (ok, name, fix) => `${ok ? 'AN ' : 'AUS'} ${name}${ok ? '' : ' – fehlt: ' + fix}`;
    return [
      line(!!cfg.apiKey, 'Denken (Anthropic)', 'ANTHROPIC_API_KEY'),
      line(!!cfg.token, 'Passwortschutz', 'JARVIS_TOKEN'),
      line(!!cfg.voice, 'Stimme (ElevenLabs)', 'ELEVENLABS_API_KEY und ELEVENLABS_VOICE_ID; sonst Browser-Stimme'),
      line(!!store.remote, 'Dauerhaftes Gedächtnis (Datenbank)', 'UPSTASH_REDIS_REST_URL und UPSTASH_REDIS_REST_TOKEN; sonst gehen Daten bei Neustart verloren'),
      line(!!cfg.mail, 'Mail-Überwachung', 'IMAP_HOST, IMAP_USER, IMAP_PASSWORD und NTFY_TOPIC oder Twilio'),
      line(!!(cfg.mail && cfg.mail.call), 'Anruf bei wichtigen Mails', 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, CALL_TO'),
      line(!!cfg.ntfy, 'Push aufs Handy', 'NTFY_TOPIC'),
      line(!!cfg.webhookUrl, 'E-Mail/Kalender über n8n', 'N8N_WEBHOOK_URL'),
      `Modelle: Chat ${cfg.model}, Recherche ${cfg.researchModel}`,
    ].join('\n');
  };

  // Chat-Anfragen nacheinander abarbeiten, damit der Speicher konsistent bleibt
  let queue = Promise.resolve();
  const enqueue = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

  const serveStatic = (req, res, pathname) => {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  };

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname === '/api/health') return json(res, 200, { ok: true, tokenRequired: !!cfg.token, keyConfigured: !!cfg.apiKey, mailWatch: !!cfg.mail, voice: !!cfg.voice, memory: store.remote ? 'datenbank' : 'datei' });

      if (pathname.startsWith('/api/')) {
        if (!authorized(req)) return json(res, 401, { error: 'Zugangs-Token fehlt oder ist falsch.' });

        if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, publicState());
        if (pathname === '/api/poll' && req.method === 'GET') {
          const jobs = takeFinishedJobs(store).map(({ id, title, status, result }) => ({ id, title, status, result }));
          return json(res, 200, { fired: takeDueReminders(store).map(({ id, text }) => ({ id, text })), jobs, state: publicState() });
        }

        if (pathname === '/api/chat' && req.method === 'POST') {
          let body;
          try { body = JSON.parse(await readBody(req)); } catch (e) { if (e instanceof AgentError) throw e; return json(res, 400, { error: 'Ungültiges JSON.' }); }
          const message = typeof body.message === 'string' ? body.message.trim() : '';
          if (!message || message.length > 4000) return json(res, 400, { error: 'Nachricht fehlt oder ist zu lang.' });
          const offsetMinutes = Number.isFinite(body.offsetMinutes) ? Math.max(-840, Math.min(840, body.offsetMinutes)) : 0;
          const actions = [];
          const reply = await enqueue(() => chat({ store, actions, message, offsetMinutes, apiKey: cfg.apiKey, model: cfg.model, userName: cfg.userName, webhookUrl: cfg.webhookUrl, mailEnabled: !!cfg.mail, startResearch: cfg.apiKey ? startJob : undefined, systemStatus, fetchFn: cfg.fetchFn }));
          return json(res, 200, { reply, actions, state: publicState() });
        }
        if (pathname === '/api/speak' && req.method === 'POST') {
          if (!cfg.voice) return json(res, 501, { error: 'Keine ElevenLabs-Stimme konfiguriert.' });
          let body;
          try { body = JSON.parse(await readBody(req)); } catch (e) { if (e instanceof AgentError) throw e; return json(res, 400, { error: 'Ungültiges JSON.' }); }
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (!text || text.length > 800) return json(res, 400, { error: 'Text fehlt oder ist zu lang.' });
          const upstream = await cfg.fetchFn(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voice.voiceId)}?output_format=mp3_44100_64`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': cfg.voice.apiKey },
              body: JSON.stringify({ text, model_id: cfg.voice.model }) });
          if (!upstream.ok) { console.warn('ElevenLabs HTTP ' + upstream.status); return json(res, 502, { error: 'Stimme nicht verfügbar (ElevenLabs ' + upstream.status + ').' }); }
          const audio = Buffer.from(await upstream.arrayBuffer());
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'no-store' });
          return res.end(audio);
        }
        return json(res, 404, { error: 'Unbekannte Route.' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      serveStatic(req, res, pathname);
    } catch (err) {
      const status = err instanceof AgentError ? err.status : 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) json(res, status, { error: err instanceof AgentError ? err.message : 'Interner Fehler.' });
    }
  });

  return { server, store, cfg };
}

// ---------- Start ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT) || 8000;
  const { server, cfg, store } = createServer();
  await store.init();
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await store.flush(); process.exit(0); });
  if (!isLoopback(host) && !cfg.token) {
    console.error('Abbruch: Der Server ist von außen erreichbar (HOST=' + host + '), aber JARVIS_TOKEN ist nicht gesetzt.');
    process.exit(1);
  }
  if (!cfg.apiKey) console.warn('Warnung: ANTHROPIC_API_KEY ist nicht gesetzt – JARVIS kann nicht antworten.');
  if (cfg.mail) { startMailWatcher({ store, config: cfg.mail }); console.log('Mail-Überwachung aktiv für ' + cfg.mail.imap.user); }
  server.listen(port, host, () => console.log(`JARVIS läuft auf http://${host}:${port}`));
}
