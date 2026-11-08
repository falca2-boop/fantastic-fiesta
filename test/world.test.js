import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parseGdelt, loadNews, findLiveCam, headlinesText } from '../lib/world.js';
import { runTool } from '../lib/tools.js';
import { Store } from '../lib/store.js';
import { createServer } from '../server.js';

test('parseRss: RSS, CDATA, Entities, Sortierung, ungültige Links werden verworfen', () => {
  const xml = `<rss><channel>
   <item><title><![CDATA[Alt &amp; neu]]></title><link>https://a.example/1</link><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate></item>
   <item><title>Neuer</title><link>https://a.example/2</link><pubDate>Sun, 08 Nov 2026 12:00:00 GMT</pubDate></item>
   <item><title>Kaputt</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const r = parseRss(xml);
  assert.deepEqual(r.map((i) => i.title), ['Neuer', 'Alt & neu']);
});

test('parseGdelt: Punkte, Links, ungültige Koordinaten raus, größte zuerst', () => {
  const r = parseGdelt({ features: [
    { geometry: { coordinates: [10, 20] }, properties: { name: 'A', count: 3, html: '<a href="https://x.example/1">Titel &amp; Co</a><a href="javascript:x">böse</a>' } },
    { geometry: { coordinates: [999, 20] }, properties: { name: 'kaputt' } },
    { geometry: { coordinates: [30, 50] }, properties: { name: 'B', count: 9 } } ] });
  assert.deepEqual(r.map((p) => p.name), ['B', 'A']);
  assert.deepEqual(r[1].links, [{ url: 'https://x.example/1', title: 'Titel & Co' }]);
});

test('loadNews: eine ausgefallene Quelle stört nicht, alle ausgefallen -> Fehler', async () => {
  const ok = (u) => ({ ok: true, status: 200, text: async () => `<rss><item><title>T ${u.slice(8, 14)}</title><link>https://n.example/x</link></item></rss>` });
  loadNews.reset();
  const some = await loadNews(async (u) => (String(u).includes('bbc') ? { ok: false, status: 500 } : ok(u)));
  assert.ok(some.length >= 2);
  // später fallen alle Quellen aus: die alten Schlagzeilen bleiben erhalten
  assert.deepEqual(await loadNews(async () => ({ ok: false, status: 500 }), Date.now() + 1e10), some);
  loadNews.reset();
  await assert.rejects(loadNews(async () => ({ ok: false, status: 500 })), /Keine Nachrichtenquelle/);
});

test('findLiveCam: braucht Schlüssel, nimmt erste einbettbare Live-ID, cached', async () => {
  await assert.rejects(findLiveCam({ query: 'x', key: '' }), /YOUTUBE_API_KEY/);
  let calls = 0, url;
  const fetchFn = async (u) => { calls++; url = String(u); return { ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: 'kaputt' } }, { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Kyiv Live', channelTitle: 'Kanal' } }] }) }; };
  const a = await findLiveCam({ query: 'Kyiv live webcam', key: 'K', fetchFn });
  assert.deepEqual(a, { videoId: 'abcdefghijk', title: 'Kyiv Live', channel: 'Kanal' });
  assert.match(url, /eventType=live/); assert.match(url, /videoEmbeddable=true/);
  await findLiveCam({ query: 'Kyiv live webcam', key: 'K', fetchFn });
  assert.equal(calls, 1);
  const none = await findLiveCam({ query: 'leer', key: 'K', fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }) });
  assert.equal(none, null);
  await assert.rejects(findLiveCam({ query: 'fehler', key: 'K', fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'quota' } }) }) }), /quota/);
});

test('Tools world_news und open_world', async () => {
  const s = new Store(null);
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => '<rss><item><title>Ukraine Waffenruhe</title><link>https://n.example/1</link></item><item><title>Wetter</title><link>https://n.example/2</link></item></rss>' });
  loadNews.reset();
  const all = await runTool(s, 'world_news', {}, { fetchFn });
  assert.match(all, /Ukraine Waffenruhe|Wetter/);
  assert.ok(headlinesText([{ source: 'DW', title: 'x' }]).includes('DW: x'));
  let opened;
  const out = await runTool(s, 'open_world', { region: 'ukraine' }, { baseUrl: 'http://127.0.0.1:8000/', openUrl: async (u) => { opened = u; return true; } });
  assert.match(out, /geöffnet/); assert.equal(opened, 'http://127.0.0.1:8000/welt.html?region=ukraine');
  assert.match(await runTool(s, 'open_world', {}, { openUrl: async () => true }), /unbekannt/);
});

test('API /api/world/cam: nur bekannte Cams, ohne Schlüssel „nokey“, mit Schlüssel Treffer', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: 'zzzzzzzzzzz' }, snippet: { title: 'T', channelTitle: 'C' } }] }) });
  const mk = (youtubeKey) => createServer({ store: new Store(null), apiKey: 'k', fetchFn, voice: null, mail: null, youtubeKey });
  for (const [key, check] of [['', (j) => assert.equal(j.error, 'nokey')], ['K', (j) => assert.equal(j.live.videoId, 'zzzzzzzzzzz')]]) {
    const { server } = mk(key); await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    check(await (await fetch(base + '/api/world/cam?name=' + encodeURIComponent('Odesa'))).json());
    assert.equal((await fetch(base + '/api/world/cam?name=Phantasie')).status, 404);
    server.close();
  }
});
