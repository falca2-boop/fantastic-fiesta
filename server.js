import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Store } from './lib/store.js';
import { chat, AgentError } from './lib/agent.js';
import { takeDueReminders } from './lib/tools.js';
import { mailConfigFromEnv, startMailWatcher } from './lib/mail.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const isLoopback = (h) => ['127.0.0.1', '::1', 'localhost'].includes(h);

export function createServer(opts = {}) {
  const env = process.env;
  const cfg = {
    apiKey: opts.apiKey ?? env.ANTHROPIC_API_KEY ?? '',
    token: opts.token ?? env.JARVIS_TOKEN ?? '',
    model: opts.model ?? env.JARVIS_MODEL ?? 'claude-sonnet-5-5',
    userName: opts.userName ?? env.JARVIS_USER_NAME ?? 'Augustin',
    webhookUrl: opts.webhookUrl ?? env.N8N_WEBHOOK_URL ?? '',
    fetchFn: opts.fetchFn ?? fetch,
    mail: opts.mail === undefined ? mailConfigFromEnv(env) : opts.mail,
    voice: opts.voice === undefined
      ? (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
          ? { apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, model: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }
          : null)
      : opts.voice,
  };
  const store = opts.store ?? new Store(path.join(env.DATA_DIR || path.join(ROOT, 'data'), 'store.json'));

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
      tasks: d.tasks.filter(t => !t.done).map(({ id, text, due }) => ({ id, text, due })),
      reminders: d.reminders.filter(r => !r.fired).sort((a, b) => new Date(a.at) - new Date(b.at)).map(({ id, text, at }) => ({ id, text, at })),
    };
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

      if (pathname === '/api/health') return json(res, 200, { ok: true, tokenRequired: !!cfg.token, keyConfigured: !!cfg.apiKey, mailWatch: !!cfg.mail, voice: !!cfg.voice });

      if (pathname.startsWith('/api/')) {
        if (!authorized(req)) return json(res, 401, { error: 'Zugangs-Token fehlt oder ist falsch.' });

        if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, publicState());
        if (pathname === '/api/poll' && req.method === 'GET') return json(res, 200, { fired: takeDueReminders(store).map(({ id, text }) => ({ id, text })), state: publicState() });

        if (pathname === '/api/chat' && req.method === 'POST') {
          let body;
          try { body = JSON.parse(await readBody(req)); } catch (e) { if (e instanceof AgentError) throw e; return json(res, 400, { error: 'Ungültiges JSON.' }); }
          const message = typeof body.message === 'string' ? body.message.trim() : '';
          if (!message || message.length > 4000) return json(res, 400, { error: 'Nachricht fehlt oder ist zu lang.' });
          const offsetMinutes = Number.isFinite(body.offsetMinutes) ? Math.max(-840, Math.min(840, body.offsetMinutes)) : 0;
          const reply = await enqueue(() => chat({ store, message, offsetMinutes, apiKey: cfg.apiKey, model: cfg.model, userName: cfg.userName, webhookUrl: cfg.webhookUrl, mailEnabled: !!cfg.mail, fetchFn: cfg.fetchFn }));
          return json(res, 200, { reply, state: publicState() });
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
  if (!isLoopback(host) && !cfg.token) {
    console.error('Abbruch: Der Server ist von außen erreichbar (HOST=' + host + '), aber JARVIS_TOKEN ist nicht gesetzt.');
    process.exit(1);
  }
  if (!cfg.apiKey) console.warn('Warnung: ANTHROPIC_API_KEY ist nicht gesetzt – JARVIS kann nicht antworten.');
  if (cfg.mail) { startMailWatcher({ store, config: cfg.mail }); console.log('Mail-Überwachung aktiv für ' + cfg.mail.imap.user); }
  server.listen(port, host, () => console.log(`JARVIS läuft auf http://${host}:${port}`));
}
