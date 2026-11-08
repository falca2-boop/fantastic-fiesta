// Erzeugt public/world/continents.json (Länder-Polygone mit Kontinent) aus world-atlas + world-countries.
// Einmalig nötig, das Ergebnis ist eingecheckt. Aufruf in einem leeren Ordner:
//   npm i world-atlas@2 topojson-client@3 world-countries@5 && node /pfad/zu/scripts/build-continents.mjs /pfad/zu/public/world/continents.json
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(process.cwd() + '/');
const { feature } = require('topojson-client');
const atlas = require('world-atlas/countries-110m.json');
const countries = require('world-countries');

const CENTERS = { Europa: [54, 15], Asien: [45, 90], Afrika: [3, 20], Nordamerika: [45, -100], Südamerika: [-15, -60], Ozeanien: [-25, 135], Antarktis: [-80, 0] };
const byNum = new Map(countries.map((c) => [String(c.ccn3), c]));
const byName = new Map(countries.map((c) => [c.name.common.toLowerCase(), c]));
const continentOf = (c) => ({ Europe: 'Europa', Asia: 'Asien', Africa: 'Afrika', Oceania: 'Ozeanien', Antarctic: 'Antarktis' }[c.region]
  || (c.subregion === 'South America' ? 'Südamerika' : 'Nordamerika'));
const mid = (g) => { const pts = []; const walk = (a) => (typeof a[0] === 'number' ? pts.push(a) : a.forEach(walk)); walk(g.coordinates); const n = pts.length;
  return [pts.reduce((s, p) => s + p[1], 0) / n, pts.reduce((s, p) => s + p[0], 0) / n]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180));
const rnd = (x) => Math.round(x * 100) / 100;
const round = (a) => (typeof a[0] === 'number' ? [rnd(a[0]), rnd(a[1])] : a.map(round));

const fc = feature(atlas, atlas.objects.countries);
const features = fc.features.map((f) => {
  const name = (f.properties && f.properties.name) || 'Unbekannt';
  const c = byNum.get(String(f.id).padStart(3, '0')) || byName.get(name.toLowerCase());
  let continent;
  if (c) continent = continentOf(c);
  else { const m = mid(f.geometry); continent = Object.entries(CENTERS).sort((a, b) => dist(m, a[1]) - dist(m, b[1]))[0][0]; }
  return { type: 'Feature', properties: { name, continent }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } };
});
fs.writeFileSync(process.argv[2], JSON.stringify({ type: 'FeatureCollection', features }));
console.log(features.length + ' Länder, ' + Object.entries(features.reduce((m, f) => (m[f.properties.continent] = (m[f.properties.continent] || 0) + 1, m), {})).map(([k, v]) => k + ' ' + v).join(', '));
