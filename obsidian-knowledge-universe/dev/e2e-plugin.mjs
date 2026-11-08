/* E2E-Test im Browser: lässt das echte Plugin gegen einen Nachbau der Obsidian-API laufen.
   Voraussetzung: Playwright (npm i -D playwright), vorher: npm run plugin-harness
   Aufruf: node dev/e2e-plugin.mjs [Ordner für Screenshot] */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u);
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(b); }); }).listen(8216);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = [];
const check = (name, ok, extra = '') => { out.push((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
try {
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://127.0.0.1:8216/dev/plugin-harness.html');
  await page.waitForFunction(() => window.ready || window.error, null, { timeout: 30000 });
  check('Plugin lädt ohne Fehler', !(await page.evaluate(() => window.error)), await page.evaluate(() => window.error || ''));
  const info = await page.evaluate(() => window.info);
  check('Ansicht, Befehl und Ribbon registriert', info.viewType === 'knowledge-universe-view' && info.commands.includes('open-knowledge-universe') && info.ribbons.length === 1, JSON.stringify(info));
  await page.waitForTimeout(3000);
  const stats = () => page.evaluate(() => [...document.querySelectorAll('.ku-stat b')].map(e => e.textContent));
  const s1 = await stats();
  check('Vault wurde eingelesen (180 Notizen)', s1[0] === '180', JSON.stringify(s1));

  // Vault ändert sich: neue Notiz + Link -> nach 1,5 s Ruhe aktualisiert
  await page.evaluate(() => {
    const f = new files[0].constructor('Projekte/NEU.md'); files.push(f); resolvedLinks[f.path] = { [files[0].path]: 1 }; kuCaches.set(f.path, {});
    vaultEvents.trigger('create', f); cacheEvents.trigger('resolved');
  });
  await page.waitForTimeout(3200);
  const s2 = await stats();
  check('Neue Notiz erscheint live (181)', s2[0] === '181', JSON.stringify(s2));

  // Löschen
  await page.evaluate(() => { const f = files.pop(); delete resolvedLinks[f.path]; vaultEvents.trigger('delete', f); });
  await page.waitForTimeout(3200);
  check('Gelöschte Notiz verschwindet (180)', (await stats())[0] === '180');

  // Änderung ohne Strukturänderung: kein Neuaufbau, Szene bleibt
  const before = await page.evaluate(() => view.renderer.layout.pos[0]);
  await page.evaluate(() => { cacheEvents.trigger('changed'); });
  await page.waitForTimeout(2500);
  check('Unveränderte Struktur lässt die Szene in Ruhe', (await page.evaluate(() => view.renderer.layout.pos[0])) === before);

  // Suche über prepareFuzzySearch, Enter öffnet Detailkarte
  await page.fill('.ku-search input', 'Notiz 17'); await page.waitForTimeout(500);
  const nRes = await page.locator('.ku-result').count();
  check('Suche liefert Treffer', nRes > 0, 'Treffer: ' + nRes);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  check('Suchtreffer zeigt Detailkarte', await page.locator('.ku-details').isVisible());
  await page.click('.ku-details .ku-btn-wide'); await page.waitForTimeout(300);
  check('"Notiz öffnen" öffnet die Datei in geteilter Ansicht', (await page.evaluate(() => window.opened)).length === 1, JSON.stringify(await page.evaluate(() => window.opened)));

  // Klick auf Knoten öffnet Notiz; Doppelklick zeigt Details ohne zusätzliches Öffnen
  const pos = await page.evaluate(() => { const r = view.renderer, cam = r.camera, N = view.data.nodes; const v = new cam.position.constructor();
    for (let i = 0; i < N.length; i++) { if (N[i].kind !== 'note' || N[i].weight < 0.25) continue; r.nodePosition(i, v); const p = v.clone().project(cam); const x = (p.x*.5+.5)*innerWidth, y = (1-(p.y*.5+.5))*innerHeight; if (p.z < 1 && x > 200 && x < 1100 && y > 100 && y < 700) return { x, y, i, title: N[i].title }; } return null; });
  check('Knoten für Klicktest gefunden', !!pos, JSON.stringify(pos));
  if (pos) {
    await page.evaluate(() => { window.opened.length = 0; });
    await page.mouse.move(pos.x, pos.y); await page.waitForTimeout(600);
    await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(700);
    check('Einfacher Klick öffnet die Notiz', (await page.evaluate(() => window.opened)).length === 1, JSON.stringify(await page.evaluate(() => window.opened)));
    await page.evaluate(() => { window.opened.length = 0; });
    await page.mouse.dblclick(pos.x, pos.y); await page.waitForTimeout(800);
    check('Doppelklick zeigt Details ohne Notiz zu öffnen', (await page.evaluate(() => window.opened)).length === 0 && await page.locator('.ku-details').isVisible());
  }

  // Aufräumen
  await page.evaluate(async () => { await view.onClose(); });
  check('onClose räumt Canvas und Oberfläche ab', (await page.locator('canvas').count()) === 0 && (await page.locator('.ku-ui').count()) === 0);
  check('Keine Seitenfehler', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.screenshot({ path: (process.argv[2] || '/tmp') + '/plugin-closed.png' });
} finally { await b.close(); srv.close(); console.log(out.join('\n')); }
