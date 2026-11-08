/* Browser-Test der Welt-Ansicht (braucht Playwright). Nachrichtenquellen werden nachgebildet, kein Internet nötig.
   Aufruf: node test/e2e/welt.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createServer } = await import('../../server.js');
const { Store } = await import('../../lib/store.js');
const rss = (name) => `<?xml version="1.0"?><rss><channel><item><title><![CDATA[${name}: Gipfel in Brüssel &amp; mehr]]></title><link>https://example.org/${name}</link><pubDate>Sun, 08 Nov 2026 20:00:00 GMT</pubDate></item></channel></rss>`;
const gdelt = { type: 'FeatureCollection', features: [
  { geometry: { type: 'Point', coordinates: [30.52, 50.45] }, properties: { name: 'Kyiv, Ukraine', count: 42, html: '<a href="https://example.org/a" target="_blank">Raketenalarm in Kyiv</a>' } },
  { geometry: { type: 'Point', coordinates: [35.2, 31.7] }, properties: { name: 'Jerusalem', count: 7, html: '' } } ] };
const fetchFn = async (url) => {
  if (String(url).includes('googleapis.com/youtube')) return { ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: 'LiveCam1234' }, snippet: { title: 'Kyjiw Live', channelTitle: 'Stadtkanal' } }] }) };
  if (String(url).includes('gdeltproject')) return { ok: true, status: 200, text: async () => JSON.stringify(gdelt) };
  return { ok: true, status: 200, text: async () => rss(String(url).includes('bbc') ? 'BBC' : 'Andere') };
};
const { server } = createServer({ store: new Store(null), apiKey: 'k', fetchFn, voice: null, mail: null, youtubeKey: 'K' });
await new Promise((r) => server.listen(8261, '127.0.0.1', r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
const check = (n, ok, x = '') => out.push((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  ' + x : ''));
try {
  const page = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:8261/welt.html?region=ukraine'); await page.waitForTimeout(2500);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  check('Weltkugel-Canvas ist da', (await page.locator('#globe canvas').count()) >= 1);
  check('Region aus der Adresse (Ukraine) ist aktiv', (await page.locator('.w-regions button.on').textContent()) === 'Ukraine');
  check('Schlagzeilen werden angezeigt (mehrere Quellen)', (await page.locator('#wNews li').count()) >= 2, String(await page.locator('#wNews li').count()));
  check('Entities im Titel sind dekodiert (&amp; → &)', (await page.locator('#wNews li a').first().textContent()).includes('Gipfel in Brüssel & mehr'));
  check('Schlagzeilen-Links öffnen sicher (noopener)', (await page.locator('#wNews li a').first().getAttribute('rel')) === 'noopener noreferrer');
  const st = await page.locator('#wStatus').textContent();
  check('Status nennt Cam-Orte und Krisenmeldungen', /12 Live-Cam-Orte · 2 Krisenmeldungen/.test(st), st);
  const pts = await page.evaluate(() => window.__welt && window.__welt.globe.pointsData().length);
  check('Globus zeigt 14 Punkte (12 Cams + 2 Krisen)', pts === 14, String(pts));
  await page.uncheck('#tEvents');
  check('Krisenmeldungen lassen sich ausblenden', (await page.evaluate(() => window.__welt.globe.pointsData().length)) === 12);
  await page.check('#tEvents');
  check('Livestream-Player startet mit Euronews (nocookie-Domain)', (await page.locator('#wVideo iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/live_stream?channel=UCSrZ3UV4jOidv8ppoVuvW9Q'));
  await page.locator('#wTabs button', { hasText: 'DW News' }).click();
  check('Kanalwechsel lädt DW News', (await page.locator('#wVideo iframe').getAttribute('src')).includes('UCknLrEdhRCp1aegoMqRaCZg'));
  await page.fill('#wCustomUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); await page.click('#wCustom button');
  check('Eigener YouTube-Link wird eingebettet', (await page.locator('#wVideo iframe').getAttribute('src')).includes('/embed/dQw4w9WgXcQ'));
  await page.fill('#wCustomUrl', 'https://evil.example/watch?v=dQw4w9WgXcQ'); await page.click('#wCustom button');
  check('Fremde Adresse wird abgelehnt', (await page.locator('#wVideo iframe').getAttribute('src')).includes('dQw4w9WgXcQ') && /kein gültiger/.test(await page.locator('#wStatus').textContent()));
  await page.evaluate(() => window.__welt.showInfo({ kind: 'cam', name: 'Kyjiw', land: 'Ukraine', art: 'krise', suche: 'https://www.youtube.com/results?search_query=x', youtube: '' }));
  await page.waitForTimeout(600);
  check('Cam-Klick: gefundene Live-Cam wird eingebettet', (await page.locator('#wInfo iframe').count()) === 1 && (await page.locator('#wInfo iframe').getAttribute('src')).includes('/embed/LiveCam1234'));
  check('Cam-Klick: Titel und Kanal der Live-Cam stehen da', (await page.locator('#wInfo .sub').nth(1).textContent()).includes('Kyjiw Live (Stadtkanal)'));
  await page.click('.w-regions button[data-region="nahost"]');
  check('Regionswechsel markiert Nahost', (await page.locator('.w-regions button.on').textContent()) === 'Nahost');
  check('Keine Seitenfehler', errs.length === 0, errs.join('|'));
  const home = await b.newPage(); await home.goto('http://127.0.0.1:8261/'); await home.waitForTimeout(800);
  check('Startseite hat den Link „Welt“ und die Jarvis-Kugel bleibt', (await home.locator('#worldLink').getAttribute('href')) === 'welt.html' && (await home.locator('#orb').count()) === 1);
} finally { await b.close(); server.close(); console.log(out.join('\n')); }
