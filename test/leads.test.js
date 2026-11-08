import test from 'node:test';
import assert from 'node:assert/strict';
import { findBusinesses, categoryFilter, detectChat, isPublicUrl, isPrivateIp, leadsText } from '../lib/leads.js';
import { runTool } from '../lib/tools.js';
import { findAgent, runAgent } from '../lib/agents.js';
import { Store } from '../lib/store.js';

const geo = [{ osm_type: 'relation', osm_id: 1234, boundingbox: ['46.9', '47.2', '15.3', '15.6'], display_name: 'Graz, Steiermark, Österreich' }];
const els = [
  { tags: { name: 'Salon Anna', 'addr:street': 'Herrengasse', 'addr:housenumber': '5', 'addr:postcode': '8010', 'addr:city': 'Graz', phone: '+43 316 1' } },
  { tags: { name: 'Salon Anna', 'addr:street': 'Herrengasse', 'addr:housenumber': '5', 'addr:postcode': '8010', 'addr:city': 'Graz' } },
  { tags: { name: 'Friseur Ohne Kontakt' } },
  { tags: { name: 'Haarstudio Bert', website: 'https://bert.example', phone: '+43 2' } },
  { tags: { name: 'Haarhaus Chat', website: 'https://chat.example' } },
  { tags: { name: 'Lokal Gesperrt', website: 'http://192.168.0.5/' } },
];
const mk = (calls = []) => async (url, init = {}) => {
  const u = String(url); calls.push({ u, body: init.body });
  if (u.includes('nominatim')) return { ok: true, status: 200, json: async () => geo };
  if (u.includes('overpass')) return { ok: true, status: 200, json: async () => ({ elements: els }) };
  if (u.startsWith('https://bert.example')) return { ok: true, status: 200, text: async () => '<html><body>Willkommen</body></html>' };
  if (u.startsWith('https://chat.example')) return { ok: true, status: 200, text: async () => '<script src="https://embed.tawk.to/abc"></script>' };
  return { ok: false, status: 404, text: async () => '' };
};
const publicLookup = async () => [{ address: '93.184.216.34' }];

test('Branchen-Zuordnung und Direktangabe', () => {
  assert.deepEqual(categoryFilter('Friseur'), ['shop', 'hairdresser']);
  assert.deepEqual(categoryFilter('shop=bakery'), ['shop', 'bakery']);
  assert.equal(categoryFilter('Raumschiffbauer'), null);
  assert.equal(categoryFilter('evil=thing'), null);
});

test('Betriebe ohne Webseite: Abfrage, Doppelte raus, erreichbare zuerst', async () => {
  const calls = [];
  const r = await findBusinesses({ city: 'Graz', category: 'friseur', fetchFn: mk(calls), lookup: publicLookup });
  const q = decodeURIComponent(calls.find((c) => c.u.includes('overpass')).body);
  assert.match(q, /area\(3600001234\)/); assert.match(q, /"shop"="hairdresser"/); assert.match(q, /\[!"website"\]/);
  assert.equal(r.items.filter((i) => i.name === 'Salon Anna').length, 1);
  assert.equal(r.items[0].name, 'Salon Anna');                    // mit Telefon vor Eintrag ohne Kontakt
  assert.match(leadsText(r), /Salon Anna – Herrengasse 5, 8010 Graz – Tel \+43 316 1/);
  assert.match(r.note, /unvollständig/);
});

test('Betriebe ohne Chat-Assistent: Webseiten werden geprüft, private Adressen nie angefragt', async () => {
  const calls = [];
  const r = await findBusinesses({ city: 'Graz', category: 'friseur', mode: 'ohne_chatbot', fetchFn: mk(calls), lookup: publicLookup });
  assert.deepEqual(r.items.map((i) => i.name), ['Haarstudio Bert']);
  assert.ok(!calls.some((c) => c.u.includes('192.168.')));
  assert.match(leadsText(r), /kein Chat-Assistent erkennbar/);
});

test('Chat-Erkennung und Schutz vor privaten Adressen', async () => {
  assert.deepEqual(detectChat('<script src="//code.tidio.co/x.js"></script> Intercom'), ['tidio', 'Intercom']);
  assert.deepEqual(detectChat('<p>nur Text</p>'), []);
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.1.1', '::1', 'fd00::1']) assert.ok(isPrivateIp(ip), ip);
  assert.ok(!isPrivateIp('93.184.216.34'));
  assert.equal(await isPublicUrl('file:///etc/passwd'), false);
  assert.equal(await isPublicUrl('http://localhost/', async () => [{ address: '127.0.0.1' }]), false);
  assert.equal(await isPublicUrl('https://x.example/', async () => [{ address: '10.0.0.8' }]), false);
  assert.equal(await isPublicUrl('https://x.example/', publicLookup), true);
});

test('Fehler: unbekannte Branche, unbekannter Ort', async () => {
  await assert.rejects(findBusinesses({ city: 'Graz', category: 'Raumschiffbauer', fetchFn: mk() }), /Unbekannte Branche/);
  await assert.rejects(findBusinesses({ city: 'Nirgendwo', category: 'friseur', fetchFn: async () => ({ ok: true, status: 200, json: async () => [] }) }), /nicht gefunden/);
});

test('Werkzeug find_businesses und Agent firmensucher', async () => {
  const s = new Store(null);
  assert.match(await runTool(s, 'find_businesses', { city: 'Graz', category: 'friseur' }, { fetchFn: mk() }), /Graz, Steiermark: \d+ Treffer/);
  assert.match(await runTool(s, 'find_businesses', { city: 'Graz', category: 'Unfug' }, { fetchFn: mk() }), /Firmensuche fehlgeschlagen: Unbekannte Branche/);
  const a = findAgent(s, 'Firmensucher');
  assert.ok(a && a.builtin && a.tools.includes('find_businesses') && !a.tools.includes('add_note'));
  const bodies = [];
  const fetchFn = async (u, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '1. Salon Anna' }] }) }; };
  assert.equal(await runAgent({ store: s, name: 'firmensucher', task: 'Friseure in Graz ohne Webseite', apiKey: 'k', model: 'm', fetchFn }), '1. Salon Anna');
  assert.deepEqual(bodies[0].tools.map((t) => t.name).sort(), ['find_businesses', 'web_search']);
});
