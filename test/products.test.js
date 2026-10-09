import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { startProduct, markdownToHtml, renderProductHtml, productFilename, productSystem, productUserMessage } from '../lib/products.js';
import { runTool, toolDefinitions } from '../lib/tools.js';
import { createServer } from '../server.js';

const reply = (text, stop_reason = 'end_turn') => ({ ok: true, status: 200, json: async () => ({ stop_reason, content: [{ type: 'text', text }] }) });
const MD = '# Titel\n*Untertitel*\n\n## Kapitel\n### Prompt 1: A\n**Wann:** jetzt\n```text\nSchreibe <script>alert(1)</script> & [PLATZHALTER]\n```\n- eins\n- zwei\n1. a\n2. b\n\n[Link](https://example.org) und [böse](javascript:alert(1))';

test('Markdown wird in sicheres HTML umgewandelt', () => {
  const html = markdownToHtml(MD);
  assert.match(html, /<h1>Titel<\/h1>/);
  assert.match(html, /<h3>Prompt 1: A<\/h3>/);
  assert.match(html, /<strong>Wann:<\/strong>/);
  assert.match(html, /<pre class="prompt"><code>Schreibe &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; \[PLATZHALTER\]<\/code><\/pre>/);
  assert.match(html, /<ul>\s*<li>eins<\/li>\s*<li>zwei<\/li>\s*<\/ul>/);
  assert.match(html, /<ol>\s*<li>a<\/li>/);
  assert.match(html, /<a href="https:\/\/example.org" rel="noopener noreferrer">Link<\/a>/);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript'));
  const page = renderProductHtml('Ti<tle>', '# x');
  assert.match(page, /<title>Ti&lt;tle&gt;<\/title>/);
  assert.match(page, /@page/);
});

test('Dateiname und Systemprompt', () => {
  assert.equal(productFilename('Prompt-Paket: Kaffee für Büro', 'html'), 'prompt-paket-kaffee-fuer-buero.html');
  assert.equal(productFilename('!!!', 'md'), 'produkt.md');
  assert.match(productSystem('prompt_pack'), /30 Prompts/);
  assert.match(productSystem('guide'), /Schritt 7/);
  assert.match(productSystem('guide'), /Keine Einkommens- oder Erfolgsversprechen/);
  const u = productUserMessage({ topic: 'T', audience: 'Z', details: 'D' });
  assert.match(u, /^<auftrag>[\s\S]*<\/auftrag>$/);
});

test('startProduct: Auftrag im Hintergrund, große Antwort, Länge begrenzt, keine Notiz', async () => {
  const s = new Store(null); const bodies = [];
  const long = '# Titel\n' + 'x'.repeat(50000);
  const fetchFn = async (url, init) => { bodies.push(JSON.parse(init.body)); return reply(long); };
  const r = startProduct({ store: s, kind: 'prompt_pack', topic: 'KI im Büro', audience: 'Selbstständige', apiKey: 'k', model: 'm', fetchFn });
  assert.equal(r.job.kind, 'product');
  assert.equal(r.job.status, 'running');
  await r.done;
  assert.equal(s.data.jobs[0].status, 'done');
  assert.ok(s.data.jobs[0].result.length <= 35000);
  assert.equal(s.data.notes.length, 0);
  assert.equal(bodies[0].max_tokens, 8000);
  assert.match(bodies[0].messages[0].content, /KI im Büro/);
  assert.equal(bodies[0].tools[0].max_uses, 3);
  assert.match(startProduct({ store: s, kind: 'ebook', topic: 'x', apiKey: 'k', model: 'm' }).error, /Unbekannte/);
  assert.match(startProduct({ store: s, kind: 'guide', topic: ' ', apiKey: 'k', model: 'm' }).error, /Thema/);
});

test('Werkzeug create_product nur wenn aktiviert', async () => {
  assert.ok(!toolDefinitions({}).some(t => t.name === 'create_product'));
  assert.ok(toolDefinitions({ productsEnabled: true }).some(t => t.name === 'create_product'));
  const s = new Store(null); let spec;
  const out = await runTool(s, 'create_product', { kind: 'guide', topic: 'T', audience: 'Z' }, { startProduct: (x) => { spec = x; return { job: { id: 'p1' } }; } });
  assert.match(out, /ID p1/);
  assert.equal(spec.kind, 'guide');
  assert.match(await runTool(s, 'create_product', { kind: 'guide' }, {}), /nicht verfügbar/);
});

test('Server: Produkt erstellen, per Poll melden, herunterladen (HTML/MD), nur mit Token', async () => {
  let step = 0;
  const fetchFn = async (url, init) => {
    const b = JSON.parse(init.body);
    if (b.tools?.some(t => t.name === 'create_product')) {
      return ++step === 1
        ? { ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'create_product', input: { kind: 'prompt_pack', topic: 'Kaffee', audience: 'Büro' } }] }) }
        : reply('Augustin, ich erstelle es.');
    }
    return reply('# Kaffee-Prompts\n\n## Kapitel\n```text\nPrompt [X]\n```');
  };
  const { server } = createServer({ store: new Store(null), apiKey: 'k', token: 'tok', fetchFn, mail: null, voice: null, ntfy: null });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`; const H = { Authorization: 'Bearer tok' };
  try {
    const chat = await (await fetch(base + '/api/chat', { method: 'POST', headers: H, body: JSON.stringify({ message: 'Mach ein Prompt-Paket' }) })).json();
    assert.match(chat.reply, /erstelle/);
    await new Promise(r => setTimeout(r, 60));
    const poll = await (await fetch(base + '/api/poll', { headers: H })).json();
    assert.equal(poll.jobs[0].kind, 'product');
    const id = poll.jobs[0].id;
    assert.ok(poll.jobs[0].result.length <= 300);
    assert.equal((await fetch(`${base}/api/jobs/${id}/download`)).status, 401);
    const html = await fetch(`${base}/api/jobs/${id}/download?format=html`, { headers: H });
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-disposition'), /attachment; filename="prompt-paket-kaffee\.html"/);
    assert.match(await html.text(), /<h1>Kaffee-Prompts<\/h1>/);
    const md = await fetch(`${base}/api/jobs/${id}/download?format=md`, { headers: H });
    assert.match(md.headers.get('content-type'), /markdown/);
    assert.match(await md.text(), /^# Kaffee-Prompts/);
    assert.equal((await fetch(`${base}/api/jobs/zzzzzz/download`, { headers: H })).status, 404);
    const state = await (await fetch(base + '/api/state', { headers: H })).json();
    assert.equal(state.products[0].id, id);
  } finally { await new Promise(r => server.close(r)); }
});
