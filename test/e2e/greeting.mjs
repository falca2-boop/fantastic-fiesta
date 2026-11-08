/* Browser-Test (braucht Playwright): Beim Öffnen begrüßt Jarvis mit der Anrede und hört sofort zu; bei von Chrome gesperrtem Ton
   kommt ein Hinweis und die Begrüßung folgt beim ersten Klick. Sprachausgabe und Spracherkennung werden nachgebildet.
   Aufruf: node test/e2e/greeting.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createServer } = await import('../../server.js');
const { Store } = await import('../../lib/store.js');
const fake = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Boss, es ist 18 Uhr.' }] }) });
const { server } = createServer({ store: new Store(null), apiKey: 'k', fetchFn: fake, voice: null, mail: null, userName: 'Boss', address: 'Hey Boss' });
await new Promise(r => server.listen(8260, '127.0.0.1', r));
const b = await chromium.launch();
const out = [];
const check = (n, ok, x = '') => out.push((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  ' + x : ''));
const mocks = (blocked) => `
  window.__spoken = []; window.__recs = []; window.__blocked = ${blocked};
  class SR { constructor() { window.__recs.push(this); this.starts = 0; } start() { this.starts++; this.running = true; this.onstart && this.onstart(); } stop() { this.running = false; setTimeout(() => this.onend && this.onend(), 0); } abort() { this.stop(); } }
  window.SpeechRecognition = window.webkitSpeechRecognition = SR;
  class U { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = U;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, cancel() {}, getVoices() { return []; }, onvoiceschanged: null,
    speak(u) { window.__spoken.push(u.text); if (window.__blocked) setTimeout(() => u.onerror && u.onerror({ error: 'not-allowed' }), 10); else setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 60); }, 10); } } });
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('kein Mikro im Test'));`;
try {
  // --- Fall 1: Ton erlaubt -> begrüßt sofort, hört sofort zu, erster Befehl ohne "Hey Jarvis"
  let ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); let page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(mocks(false));
  await page.goto('http://127.0.0.1:8260/'); await page.waitForTimeout(1500);
  const spoken = await page.evaluate(() => window.__spoken);
  check('Beim Öffnen wird "Hey Boss." ohne Klick gesprochen', spoken[0] === 'Hey Boss.', JSON.stringify(spoken));
  check('Die Begrüßung erscheint auch im Gespräch', (await page.locator('.msg.jarvis .bubble').first().textContent()) === 'Hey Boss.');
  check('Das Zuhören läuft sofort (Mikro-Knopf aktiv, Spracherkennung gestartet)', await page.locator('#micBtn.active').count() === 1 && (await page.evaluate(() => window.__recs[0] && window.__recs[0].starts)) >= 1);
  check('Danach steht der Status auf "Höre zu"', (await page.locator('#stateText').textContent()).includes('Höre zu'));
  // Erster Befehl ohne Wake-Word
  await page.evaluate(() => { const r = window.__recs[0]; const res = [[{ transcript: 'Wie spät ist es' }]]; res[0].isFinal = true; r.onresult({ resultIndex: 0, results: res }); });
  await page.waitForTimeout(800);
  check('Der erste Befehl wird ohne "Hey Jarvis" angenommen', (await page.locator('.msg.user .bubble').allTextContents()).includes('Wie spät ist es'));
  check('Es wird nur einmal begrüßt', (await page.evaluate(() => window.__spoken.filter((t) => t === 'Hey Boss.').length)) === 1);
  // Wake-Word: ohne "Jarvis" ignorieren, nur "Hey Jarvis" -> zuhören, danach Befehl; Variante mit Befehl im selben Satz
  const say = (t) => page.evaluate((t) => { const r = window.__recs[0]; const res = [[{ transcript: t }]]; res[0].isFinal = true; r.onresult({ resultIndex: 0, results: res }); }, t);
  await page.waitForTimeout(500);
  const userCount = async () => (await page.locator('.msg.user .bubble').allTextContents());
  await say('Das Wetter ist schön'); await page.waitForTimeout(400);
  check('Sprache ohne "Jarvis" wird ignoriert', !(await userCount()).includes('Das Wetter ist schön'));
  await say('Hey Jarvis'); await page.waitForTimeout(400);
  check('"Hey Jarvis" zeigt "Ja? Sag deinen Befehl"', (await page.locator('#heard.wake').textContent()).includes('Befehl'));
  check('Nach "Hey Jarvis" steht der Status auf "Höre zu"', (await page.locator('#stateText').textContent()).includes('Höre zu'));
  await say('Was steht heute an'); await page.waitForTimeout(600);
  check('Der Befehl nach "Hey Jarvis" wird angenommen', (await userCount()).includes('Was steht heute an'));
  await page.waitForTimeout(1500);
  await say('Hej Dscharwis Plane meinen Tag'); await page.waitForTimeout(600);
  check('Variante "Dscharwis" + Befehl im selben Satz', (await userCount()).includes('Plane meinen Tag'));
  check('Keine Seitenfehler (Fall 1)', errs.length === 0, errs.join('|'));
  await ctx.close();

  // --- Fall 2: Chrome blockiert Ton ohne Klick -> Hinweis, Hören läuft trotzdem, Begrüßung beim ersten Klick
  ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); page = await ctx.newPage();
  const errs2 = []; page.on('pageerror', e => errs2.push(e.message));
  await page.addInitScript(mocks(true));
  await page.goto('http://127.0.0.1:8260/'); await page.waitForTimeout(1500);
  const texts = await page.locator('.msg.jarvis .bubble').allTextContents();
  check('Bei gesperrtem Ton erscheint ein Hinweis mit Lösung', texts.some((t) => t.includes('Ton') && t.includes('Zulassen')), JSON.stringify(texts).slice(0, 160));
  check('Hören läuft trotz gesperrtem Ton', await page.locator('#micBtn.active').count() === 1);
  await page.evaluate(() => { window.__blocked = false; });
  await page.mouse.click(600, 400); await page.waitForTimeout(800);
  const sp2 = await page.evaluate(() => window.__spoken);
  check('Beim ersten Klick wird die Begrüßung nachgeholt', sp2.filter((t) => t === 'Hey Boss.').length === 2, JSON.stringify(sp2));
  check('Die Begrüßung steht nicht doppelt im Gespräch', (await page.locator('.msg.jarvis .bubble').allTextContents()).filter((t) => t === 'Hey Boss.').length === 1);
  check('Keine Seitenfehler (Fall 2)', errs2.length === 0, errs2.join('|'));
  await ctx.close();
} finally { await b.close(); server.close(); console.log(out.join('\n')); }
