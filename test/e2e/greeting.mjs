/* Browser-Test (braucht Playwright): Beim Öffnen begrüßt Jarvis mit der Anrede und hört sofort zu; bei von Chrome gesperrtem Ton
   kommt ein Hinweis und die Begrüßung folgt beim ersten Klick. Sprachausgabe und Spracherkennung werden nachgebildet.
   Aufruf: node test/e2e/greeting.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createServer } = await import('../../server.js');
const { Store } = await import('../../lib/store.js');
const fake = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Boss, es ist 18 Uhr.' }], usage: { input_tokens: 5000, output_tokens: 100 } }) });
const { server } = createServer({ store: new Store(null), apiKey: 'k', fetchFn: fake, voice: null, mail: null, userName: 'Boss', address: 'Hey Boss' });
await new Promise(r => server.listen(8260, '127.0.0.1', r));
const b = await chromium.launch();
const out = [];
const check = (n, ok, x = '') => out.push((ok ? 'OK   ' : 'FAIL ') + n + (x ? '  ' + x : ''));
const mocks = (blocked) => `
  window.__spoken = []; window.__recs = []; window.__blocked = ${blocked}; window.JARVIS_FOLLOW_MS = 15000;
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
  // Neues Layout: Orb fast bildschirmfüllend in der Mitte, Gespräch links und Übersicht rechts zum Aufklappen
  const orbBox = await page.locator('#orb').boundingBox();
  check('Orb-Kugel ist riesig: mindestens 70 % der Fensterhöhe', orbBox.height >= 0.7 * 800, JSON.stringify(orbBox));
  check('Orb-Kugel liegt in der horizontalen Mitte', Math.abs((orbBox.x + orbBox.width / 2) - 640) < 6, String(orbBox.x + orbBox.width / 2));
  check('Gespräch und Übersicht sind eingeklappt', !(await page.locator('#drawerChat.open').count()) && !(await page.locator('#drawerSide.open').count()) && (await page.locator('#drawerChat').isHidden()));
  check('Eingabe und Mikrofon sind unten in der Mitte sichtbar', await page.locator('#composer').isVisible() && await page.locator('#micBtn').isVisible());
  check('Die letzte Antwort steht über der Kugel, auch bei eingeklapptem Gespräch', (await page.locator('#liveReply').textContent()).length > 0 && await page.locator('#liveReply').isVisible());
  const sayNow = (t) => page.evaluate((t) => { const r = window.__recs[0]; const res = [[{ transcript: t }]]; res[0].isFinal = true; r.onresult({ resultIndex: 0, results: res }); }, t);
  await sayNow('Und morgen?'); await page.waitForTimeout(500);
  check('Nach einer Antwort geht das Gespräch weiter: Folgefrage ohne „Hey Jarvis“ wird angenommen', (await page.locator('.msg.user .bubble').allTextContents()).includes('Und morgen?'));
  check('Nach der Antwort zeigt Jarvis „Ich höre weiter zu“', /weiter zu/.test(await page.locator('#heard').textContent()));
  await page.waitForTimeout(500);
  check('Kostenanzeige im Kasten System zeigt den echten Verbrauch (zwei Antworten: ≈ 0,02 $, 10.200 Token)', /Heute.*≈ 0,02 \$ · 10\.200 Token/.test((await page.locator('#usageBox').textContent()).replace(/\s+/g, ' ')), (await page.locator('#usageBox').textContent()).replace(/\s+/g, ' '));
  check('Kosten stehen oben rechts als Chip und in der Karte „Kosten“ ganz oben rechts', /≈ 0,02 \$ heute/.test(await page.locator('#costChip').textContent()) && (await page.locator('.side .card').first().getAttribute('id')) === 'cardCost' && (await page.locator('#cardCost #usageBox').count()) === 1);
  check('Es wird nur einmal begrüßt', (await page.evaluate(() => window.__spoken.filter((t) => t === 'Hey Boss.').length)) === 1);
  // Wake-Word: ohne "Jarvis" ignorieren, nur "Hey Jarvis" -> zuhören, danach Befehl; Variante mit Befehl im selben Satz
  const say = (t) => page.evaluate((t) => { const r = window.__recs[0]; const res = [[{ transcript: t }]]; res[0].isFinal = true; r.onresult({ resultIndex: 0, results: res }); }, t);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__disarm()); await page.waitForTimeout(300);
  const userCount = async () => (await page.locator('.msg.user .bubble').allTextContents());
  await say('Das Wetter ist schön'); await page.waitForTimeout(400);
  check('Sprache ohne "Jarvis" wird ignoriert', !(await userCount()).includes('Das Wetter ist schön'));
  // „Hey Jarvis“ nur als Zwischenergebnis (Chrome liefert das Endergebnis oft spät): Jarvis antwortet trotzdem von selbst
  const nBefore = (await page.evaluate(() => window.__spoken)).length;
  await page.evaluate(() => { const r = window.__recs[0]; r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Hey Jarvis' }], { isFinal: false })] }); });
  await page.waitForTimeout(1500);
  check('„Hey Jarvis“ wird schon nach dem Zwischenergebnis beantwortet', (await page.evaluate(() => window.__spoken)).length > nBefore);
  await page.waitForTimeout(600);
  await say('Hey Jarvis'); await page.waitForTimeout(400);
  check('"Hey Jarvis" zeigt "Ja? Sag deinen Befehl"', (await page.locator('#heard.wake').textContent()).includes('Befehl'));
  const ACKS = ['Ja, ich bin da.', 'Klar, ich höre dir zu.', 'Schieß los, ich bin ganz Ohr.', 'Immer. Was gibt es?', 'Ja? Sag an.', 'Hey, ich bin da. Was brauchst du?'];
  check('Auf „Hey Jarvis“ antwortet Jarvis sofort mit einem freundlichen Satz', (await page.evaluate(() => window.__spoken)).some((t) => ACKS.includes(t)), JSON.stringify(await page.evaluate(() => window.__spoken.slice(-2))));
  check('Nach "Hey Jarvis" steht der Status auf "Höre zu"', (await page.locator('#stateText').textContent()).includes('Höre zu'));
  await say('Was steht heute an'); await page.waitForTimeout(600);
  check('Der Befehl nach "Hey Jarvis" wird angenommen', (await userCount()).includes('Was steht heute an'));
  await page.waitForTimeout(1500);
  await say('Hej Dscharwis Plane meinen Tag'); await page.waitForTimeout(600);
  check('Variante "Dscharwis" + Befehl im selben Satz', (await userCount()).includes('Plane meinen Tag'));
  // Analyse-Modus: formatierter Chat-Text, gesprochen wird nur der Teil nach <<SPRICH>>
  await page.route('**/api/chat', (route) => route.fulfill({ json: { reply: '## Kernaussage\nDas ist **wichtig**.\n## Nächste Schritte\n- Erstens testen\n- Zweitens starten\n<<SPRICH>>\nMeine Empfehlung: Erst testen, dann starten.', state: { tasks: [], reminders: [], notes: [], goal: null } } }));
  await page.waitForTimeout(1500);
  await say('Hey Jarvis analysiere meine Strategie'); await page.waitForTimeout(1200);
  check('Analyse: Überschriften und Liste werden formatiert', (await page.locator('.bubble.rich h4').count()) === 2 && (await page.locator('.bubble.rich li').count()) === 2);
  check('Analyse: Fettdruck wird dargestellt', (await page.locator('.bubble.rich strong').textContent()) === 'wichtig');
  check('Analyse: Marker steht nicht im Chat', !(await page.locator('.msg.jarvis').last().textContent()).includes('SPRICH'));
  const sp = await page.evaluate(() => window.__spoken);
  check('Analyse: gesprochen wird nur die Kurzfassung', sp[sp.length - 1] === 'Meine Empfehlung: Erst testen, dann starten.', JSON.stringify(sp.slice(-1)));
  await page.reload(); await page.waitForTimeout(1500);
  check('Chatverlauf bleibt nach dem Neuladen erhalten', (await page.locator('.chat-sep').count()) === 2 && (await page.locator('.msg.user .bubble').allTextContents()).includes('Wie spät ist es') && (await page.locator('.msg.user .bubble').allTextContents()).includes('Plane meinen Tag'));
  check('Wiederhergestellte Analyse bleibt formatiert', (await page.locator('.bubble.rich h4').count()) >= 1);
  check('Begrüßung wird nicht als Verlauf gespeichert (nur die neue)', (await page.locator('.msg.jarvis .bubble', { hasText: /^Hey Boss\.$/ }).count()) === 1);
  await sayNow('Und jetzt?'); await page.waitForTimeout(1000);
  check('Neue Antwort bei eingeklapptem Gespräch zeigt einen Zähler am linken Reiter', (await page.locator('#chatBadge').isVisible()) && Number(await page.locator('#chatBadge').textContent()) >= 1);
  await page.click('#tabChat'); await page.waitForTimeout(500);
  check('Linker Reiter klappt das Gespräch auf (Zähler weg)', (await page.locator('#drawerChat.open').count()) === 1 && (await page.locator('#drawerChat').isVisible()) && (await page.locator('#chatBadge').isHidden()) && (await page.locator('#tabChat').getAttribute('aria-expanded')) === 'true');
  check('Aufgeklapptes Gespräch zeigt den Verlauf', (await page.locator('#drawerChat .msg.user .bubble').count()) >= 1);
  await page.locator('#drawerChat .msg.jarvis .fb button').last().click(); await page.waitForTimeout(500);
  check('Daumen unter der Antwort: Bewertung wird gespeichert und bedankt', (await page.locator('#drawerChat .fb-thanks').count()) === 1 && (await page.locator('#drawerChat .fb button.on').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('Escape klappt das Gespräch wieder ein', (await page.locator('#drawerChat.open').count()) === 0);
  await page.click('#tabSide'); await page.waitForTimeout(500);
  check('Rechter Reiter klappt die Übersicht mit den Kästchen auf', (await page.locator('#drawerSide.open').count()) === 1 && (await page.locator('#drawerSide #cardCost').isVisible()) && (await page.locator('#drawerSide #cardAgents').count()) === 1 && (await page.locator('#drawerSide #cardLearned').count()) === 1 && /Lernrunde täglich um 22:30/.test(await page.locator('#learnedInfo').textContent()));
  await page.click('#drawerSide .drawer-x'); await page.waitForTimeout(500);
  check('Schließen-Knopf klappt die Übersicht ein', (await page.locator('#drawerSide.open').count()) === 0);
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
