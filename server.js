/**
 * JARVIS – Server
 * Node 20+, keine externen Abhängigkeiten außer imapflow (optional)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chat } from './lib/agent.js';
import { speak } from './lib/voice.js';
import { getState } from './lib/store.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? '127.0.0.1';
const TOKEN = process.env.JARVIS_TOKEN ?? '';
const PUBLIC = path.join(__dir, 'public');

// Safety: Token ist Pflicht, wenn der Server von außen erreichbar ist
if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN) {
  console.error('JARVIS_TOKEN muss gesetzt sein wenn HOST nicht localhost ist');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function auth(req) {
  if (!TOKEN) return true;
  const auth = req.headers['authorization'] ?? '';
  const cookie = (req.headers['cookie'] ?? '')
    .split(';')
    .find(c => c.trim().startsWith('jarvis_token='))
    ?.split('=')[1]?.trim();
  return auth === `Bearer ${TOKEN}` || cookie === TOKEN;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // --- Static files ---
  if (req.method === 'GET' && !pathname.startsWith('/api/')) {
    // Login page special-case
    if (TOKEN && !auth(req) && pathname !== '/login') {
      res.writeHead(302, { Location: '/login' });
      return res.end();
    }
    const target = pathname === '/' ? '/index.html' : pathname;
    const file = path.join(PUBLIC, target);
    if (!file.startsWith(PUBLIC)) return json(res, 400, { error: 'bad path' });
    try {
      const data = fs.readFileSync(file);
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      return res.end(data);
    } catch {
      res.writeHead(404); return res.end('Not found');
    }
  }

  // --- API ---
  if (!auth(req)) return json(res, 401, { error: 'unauthorized' });

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req);
    let token;
    try { token = JSON.parse(body).token; } catch { return json(res, 400, { error: 'bad json' }); }
    if (token === TOKEN) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `jarvis_token=${TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    return json(res, 403, { error: 'wrong token' });
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, ts: Date.now() });
  }

  if (req.method === 'GET' && pathname === '/api/state') {
    return json(res, 200, getState());
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    const body = await readBody(req);
    let message;
    try { message = JSON.parse(body).message; } catch { return json(res, 400, { error: 'bad json' }); }
    if (!message?.trim()) return json(res, 400, { error: 'message required' });
    try {
      const reply = await chat(message.trim());
      return json(res, 200, { reply });
    } catch (err) {
      console.error('chat error:', err);
      return json(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && pathname === '/api/speak') {
    const body = await readBody(req);
    let text;
    try { text = JSON.parse(body).text; } catch { return json(res, 400, { error: 'bad json' }); }
    if (!text?.trim()) return json(res, 400, { error: 'text required' });
    try {
      const audio = await speak(text.slice(0, 800));
      if (!audio) return json(res, 204, {});
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
      return res.end(audio);
    } catch (err) {
      console.error('speak error:', err);
      return json(res, 500, { error: err.message });
    }
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`JARVIS läuft auf http://${HOST}:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠  ANTHROPIC_API_KEY fehlt');
});

process.on('uncaughtException', err => console.error('uncaught:', err));
process.on('unhandledRejection', err => console.error('unhandled:', err));
