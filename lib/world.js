/**
 * Welt-Nachrichten: Schlagzeilen aus öffentlichen RSS-Feeds und georeferenzierte Krisenmeldungen (GDELT GEO, ohne Schlüssel).
 * Alles wird zwischengespeichert; fällt eine Quelle aus, liefern die anderen weiter.
 */

export const NEWS_FEEDS = [
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-de-all' },
  { id: 'tagesschau', name: 'Tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml' },
  { id: 'bbc', name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
];

export const CONFLICT_QUERY = '(war OR missile OR shelling OR airstrike OR "armed conflict" OR drone strike)';

const decode = (s) => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

/** Liest Schlagzeilen aus RSS/RDF/Atom-ähnlichem XML. Gibt [{ title, link, ts }] zurück (neueste zuerst). */
export function parseRss(xml, limit = 15) {
  const items = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g)) {
    const b = m[0];
    const title = decode((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    let link = decode((b.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || '');
    if (!link) link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const when = (b.match(/<(?:pubDate|dc:date|published|updated)[^>]*>([\s\S]*?)<\//) || [])[1];
    const ts = when ? Date.parse(decode(when)) : NaN;
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, ts: Number.isFinite(ts) ? ts : 0 });
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/** GDELT-GeoJSON in eine einfache Punktliste umwandeln: [{ lat, lng, name, count, links:[{title,url}] }] (größte zuerst). */
export function parseGdelt(json, limit = 120) {
  const out = [];
  for (const f of (json && json.features) || []) {
    const c = f.geometry && f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const p = f.properties || {};
    const links = [...String(p.html || '').matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => ({ url: m[1], title: decode(m[2]) })).filter((l) => l.title).slice(0, 4);
    out.push({ lat, lng, name: decode(p.name || 'Unbekannt'), count: Number(p.count) || 1, links });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit);
}

function cached(ttlMs, load) {
  let at = 0, value = null, pending = null;
  const get = async (fetchFn, now = Date.now()) => {
    if (value && now - at < ttlMs) return value;
    if (!pending) pending = load(fetchFn).then((v) => { value = v; at = Date.now(); return v; }).finally(() => { pending = null; });
    try { return await pending; } catch (err) { if (value) return value; throw err; }   // bei Fehler lieber alte Daten als nichts
  };
  get.reset = () => { value = null; at = 0; };
  return get;
}

const getText = async (fetchFn, url) => {
  const res = await fetchFn(url, { headers: { 'User-Agent': 'Jarvis/1.0 (+lokal)' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
};

export const loadNews = cached(5 * 60 * 1000, async (fetchFn) => {
  const results = await Promise.allSettled(NEWS_FEEDS.map(async (f) => parseRss(await getText(fetchFn, f.url), 8).map((i) => ({ ...i, source: f.name }))));
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!all.length) throw new Error('Keine Nachrichtenquelle erreichbar.');
  // Quellen abwechselnd mischen, damit nicht eine alles belegt
  return all.sort((a, b) => b.ts - a.ts).slice(0, 30);
});

export const loadEvents = cached(10 * 60 * 1000, async (fetchFn) => {
  const url = 'https://api.gdeltproject.org/api/v2/geo/geo?query=' + encodeURIComponent(CONFLICT_QUERY) + '&mode=PointData&format=GeoJSON&timespan=24h&maxpoints=250';
  return parseGdelt(JSON.parse(await getText(fetchFn, url)));
});

/** Kurze Textfassung für Jarvis (vorlesen). */
export function headlinesText(items, n = 8) {
  return items.slice(0, n).map((i) => `${i.source}: ${i.title}`).join('\n');
}

// ---------- Echte Live-Cams: findet per YouTube-Daten-API ein GERADE LAUFENDES, einbettbares Live-Video ----------

const camCache = new Map();   // Suchtext -> { at, value }
const CAM_TTL = 3 * 60 * 60 * 1000;

/** Sucht ein aktuell laufendes Live-Video (eventType=live, einbettbar). Gibt { videoId, title, channel } oder null zurück. */
export async function findLiveCam({ query, key, match = null, fetchFn = fetch, now = Date.now() }) {
  if (!key) throw Object.assign(new Error('YOUTUBE_API_KEY fehlt.'), { code: 'nokey' });
  const ckey = query + '|' + (match ? match.source : '');
  const hit = camCache.get(ckey);
  if (hit && now - hit.at < CAM_TTL) return hit.value;
  const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live&videoEmbeddable=true&maxResults=10&order=relevance'
    + '&q=' + encodeURIComponent(query) + '&key=' + encodeURIComponent(key);
  const res = await fetchFn(url, { signal: AbortSignal.timeout(12000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data.error && data.error.message) || 'YouTube HTTP ' + res.status), { code: res.status });
  const first = (data.items || []).find((i) => i.id && /^[\w-]{11}$/.test(i.id.videoId || '') && (!match || match.test((i.snippet && i.snippet.channelTitle) || '')));
  const value = first ? { videoId: first.id.videoId, title: (first.snippet && first.snippet.title) || '', channel: (first.snippet && first.snippet.channelTitle) || '' } : null;
  camCache.set(ckey, { at: now, value });
  return value;
}

/** Nachrichtensender, deren aktuellen Livestream Jarvis per YouTube-Suche findet. match prüft den Kanalnamen (gegen untergeschobene Re-Streams). */
export const STREAMS = {
  dozhd: { name: 'Dozhd (RU, unabhängig)', query: 'Дождь Dozhd TV Rain прямой эфир live', match: /дождь|dozhd|tv ?rain/i },
  currenttime: { name: 'Current Time (RU)', query: 'Настоящее Время Current Time прямой эфир live', match: /настоящее время|current time/i },
  dwru: { name: 'DW Russisch', query: 'DW на русском прямой эфир live', match: /dw (на русском|russian|russisch)|deutsche welle/i },
  russia24: { name: 'Россия 24 (Staatssender)', query: 'Россия 24 прямой эфир live', match: /россия ?24|russia ?24|вести|vesti/i },
  digi24: { name: 'Digi24 (RO)', query: 'Digi24 live stream știri', match: /digi ?24/i },
  antena3: { name: 'Antena 3 CNN (RO)', query: 'Antena 3 CNN live stream știri', match: /antena ?3|cnn/i },
  realitatea: { name: 'Realitatea Plus (RO)', query: 'Realitatea Plus live stream știri', match: /realitatea/i },
  tvrinfo: { name: 'TVR Info (RO)', query: 'TVR Info live stream știri', match: /tvr|televiziunea rom/i },
  euronewsro: { name: 'Euronews România', query: 'Euronews România live stream', match: /euronews/i },
};
