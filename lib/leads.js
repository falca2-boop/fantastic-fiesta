/**
 * Firmen-Suche: findet lokale Betriebe ohne Webseite (Daten aus OpenStreetMap, öffentlich, ohne Schlüssel)
 * oder mit Webseite, aber ohne erkennbaren Chat-/KI-Assistenten (Startseite wird geprüft).
 * Es werden nur öffentlich eingetragene Firmendaten gelesen. Nichts wird kontaktiert.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

export const CATEGORIES = {
  friseur: ['shop', 'hairdresser'], frisör: ['shop', 'hairdresser'], barbier: ['shop', 'hairdresser'], kosmetik: ['shop', 'beauty'], nagelstudio: ['shop', 'beauty'],
  restaurant: ['amenity', 'restaurant'], gasthaus: ['amenity', 'restaurant'], cafe: ['amenity', 'cafe'], café: ['amenity', 'cafe'], bar: ['amenity', 'bar'], imbiss: ['amenity', 'fast_food'],
  bäckerei: ['shop', 'bakery'], baeckerei: ['shop', 'bakery'], fleischerei: ['shop', 'butcher'], metzgerei: ['shop', 'butcher'], blumen: ['shop', 'florist'], florist: ['shop', 'florist'],
  zahnarzt: ['amenity', 'dentist'], arzt: ['amenity', 'doctors'], tierarzt: ['amenity', 'veterinary'], apotheke: ['amenity', 'pharmacy'], physiotherapie: ['healthcare', 'physiotherapist'],
  fitness: ['leisure', 'fitness_centre'], fitnessstudio: ['leisure', 'fitness_centre'], werkstatt: ['shop', 'car_repair'], autowerkstatt: ['shop', 'car_repair'], reifen: ['shop', 'tyres'],
  hotel: ['tourism', 'hotel'], pension: ['tourism', 'guest_house'], ferienwohnung: ['tourism', 'apartment'], optiker: ['shop', 'optician'], bekleidung: ['shop', 'clothes'], schuhe: ['shop', 'shoes'],
  elektriker: ['craft', 'electrician'], maler: ['craft', 'painter'], tischler: ['craft', 'carpenter'], schreiner: ['craft', 'carpenter'], installateur: ['craft', 'plumber'], klempner: ['craft', 'plumber'],
  dachdecker: ['craft', 'roofer'], gärtner: ['craft', 'gardener'], fotograf: ['craft', 'photographer'], steuerberater: ['office', 'tax_advisor'], rechtsanwalt: ['office', 'lawyer'], versicherung: ['office', 'insurance'],
};

const CHAT_SIGNS = [
  ['tidio', /tidio/i], ['Intercom', /intercom/i], ['Drift', /js\.driftt?\.com|drift\.com/i], ['Crisp', /crisp\.chat/i], ['LiveChat', /livechat(inc)?\.com/i], ['Zendesk', /zopim|zendesk|zdassets/i],
  ['tawk.to', /tawk\.to/i], ['HubSpot-Chat', /hs-scripts\.com|hubspot.{0,40}conversations/i], ['Userlike', /userlike/i], ['Freshchat', /freshchat|wchat\.freshchat/i], ['Smartsupp', /smartsupp/i],
  ['Olark', /olark/i], ['Botpress/Landbot', /botpress|landbot/i], ['Chatbot', /chat-?bot|ki-?assistent|ai-?assistant|virtueller assistent/i], ['JivoChat', /jivosite|jivochat/i], ['Chatwoot', /chatwoot/i],
];

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function categoryFilter(cat) {
  const c = clean(cat).toLowerCase();
  if (CATEGORIES[c]) return CATEGORIES[c];
  const m = c.match(/^([a-z_:]+)\s*=\s*([a-z_]+)$/);          // z. B. shop=hairdresser
  if (m && ['shop', 'amenity', 'craft', 'office', 'tourism', 'leisure', 'healthcare'].includes(m[1])) return [m[1], m[2]];
  return null;
}

/** Nur öffentliche Internetadressen (kein localhost, keine privaten Netze), damit fremde Einträge den Rechner nicht ansteuern. */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224 || (a === 100 && b >= 64 && b <= 127); }
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'); }
  return true;
}
export async function isPublicUrl(raw, lookup = dns.lookup) {
  let u; try { u = new URL(raw); } catch (e) { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  if (net.isIP(u.hostname)) return !isPrivateIp(u.hostname);
  try { const addrs = await lookup(u.hostname, { all: true }); return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address)); } catch (e) { return false; }
}

export function detectChat(html) {
  const found = CHAT_SIGNS.filter(([, re]) => re.test(html)).map(([n]) => n);
  return [...new Set(found)];
}

async function getJson(fetchFn, url, init = {}) {
  const res = await fetchFn(url, { ...init, headers: { 'User-Agent': 'Jarvis/1.0 (lokaler Assistent)', ...(init.headers || {}) }, signal: AbortSignal.timeout(28000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export function addressOf(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const town = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
  return [street, town].filter(Boolean).join(', ');
}

/** Sucht Betriebe. mode: 'ohne_webseite' oder 'ohne_chatbot'. Gibt { city, items:[...], note } zurück. */
export async function findBusinesses({ city, category, mode = 'ohne_webseite', limit = 5, fetchFn = fetch, lookup = dns.lookup }) {
  const filter = categoryFilter(category);
  if (!filter) throw new Error('Unbekannte Branche „' + category + '“. Beispiele: ' + [...new Set(Object.keys(CATEGORIES))].slice(0, 14).join(', ') + ' oder direkt z. B. shop=hairdresser.');
  const q = clean(city); if (!q) throw new Error('Ort fehlt.');
  const geo = await getJson(fetchFn, 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q=' + encodeURIComponent(q));
  if (!geo.length) throw new Error('Ort „' + q + '“ nicht gefunden.');
  const g = geo[0];
  const [s, n, w, e] = (g.boundingbox || []).map(Number);
  const area = g.osm_type === 'relation' ? `area(${3600000000 + Number(g.osm_id)})->.a;` : null;
  const scope = area ? '(area.a)' : `(${s},${w},${n},${e})`;
  const web = mode === 'ohne_webseite' ? '[!"website"][!"contact:website"][!"url"]' : '["website"]';
  const lim = Math.max(1, Math.min(40, Number(limit) || 5));
  const query = `[out:json][timeout:25];${area || ''}nwr${scope}["${filter[0]}"="${filter[1]}"]["name"]${web};out tags center ${lim * 3};`;
  const data = await getJson(fetchFn, 'https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) });
  let items = (data.elements || []).map((el) => {
    const t = el.tags || {};
    return { name: clean(t.name), address: addressOf(t), phone: clean(t.phone || t['contact:phone'] || t['contact:mobile']), email: clean(t.email || t['contact:email']), website: clean(t.website || t['contact:website'] || t.url), hasFacebook: !!(t['contact:facebook'] || t.facebook), hasInstagram: !!(t['contact:instagram']) };
  }).filter((i) => i.name);
  // Doppelte (gleicher Name und Adresse) entfernen, solche mit Telefon oder Mail zuerst (erreichbar)
  const seen = new Set(); items = items.filter((i) => { const k = (i.name + '|' + i.address).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  items.sort((a, b) => (Number(!!(b.phone || b.email)) - Number(!!(a.phone || a.email))));
  if (mode === 'ohne_chatbot') {
    const checked = [];
    for (const it of items) {
      if (checked.length >= lim) break;
      let url = it.website; if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try {
        if (!(await isPublicUrl(url, lookup))) continue;
        const res = await fetchFn(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Jarvis/1.0)' }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
        if (!res.ok) { checked.push({ ...it, chat: [], note: 'Webseite nicht erreichbar (HTTP ' + res.status + ')' }); continue; }
        const html = (await res.text()).slice(0, 400000);
        const chat = detectChat(html);
        checked.push({ ...it, chat, note: chat.length ? 'hat Chat/Assistent: ' + chat.join(', ') : 'kein Chat-Assistent erkennbar' });
      } catch (err) { checked.push({ ...it, chat: [], note: 'Webseite nicht prüfbar' }); }
    }
    items = checked.filter((i) => !i.chat.length);
  } else items = items.slice(0, lim);
  return { city: g.display_name.split(',').slice(0, 2).join(','), items, note: mode === 'ohne_webseite' ? 'Betriebe ohne eingetragene Webseite in OpenStreetMap. Die Daten können unvollständig sein: vor dem Kontakt kurz im Web gegenprüfen.' : 'Webseiten, auf deren Startseite kein Chat-/KI-Assistent erkannt wurde (nur Startseite, Script-Erkennung). Vor dem Kontakt kurz selbst ansehen.' };
}

export function leadsText(r) {
  if (!r.items.length) return 'Keine passenden Betriebe in ' + r.city + ' gefunden. ' + r.note;
  return r.city + ': ' + r.items.length + ' Treffer\n' + r.items.map((i, n) => `${n + 1}. ${i.name}${i.address ? ' – ' + i.address : ''}${i.phone ? ' – Tel ' + i.phone : ''}${i.email ? ' – ' + i.email : ''}${i.website ? ' – ' + i.website : ''}${i.note ? ' – ' + i.note : ''}${(i.hasFacebook || i.hasInstagram) && !i.website ? ' – nur Social Media' : ''}`).join('\n') + '\n' + r.note;
}
