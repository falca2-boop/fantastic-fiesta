/* Welt-Ansicht: Weltkugel (globe.gl) mit Live-Cams und Krisenmeldungen, Nachrichten-Livestream, Schlagzeilen. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let TOKEN = '';
  try { TOKEN = localStorage.getItem('jarvis_token') || ''; } catch (e) {}

  async function api(path) {
    const res = await fetch(path, { headers: TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {} });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Fehler ' + res.status); err.code = res.status; throw err; }
    return data;
  }

  // ---------- Livestream ----------
  const CHANNELS = [
    { name: 'Euronews', id: 'UCSrZ3UV4jOidv8ppoVuvW9Q' },
    { name: 'DW News', id: 'UCknLrEdhRCp1aegoMqRaCZg' },
    { name: 'France 24', id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
    { name: 'Sky News', id: 'UCoMdktPbSTixAyNGwb-UYkQ' },
    { name: 'Al Jazeera', id: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  ];
  const ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  function playEmbed(src, openUrl, target) {
    const box = target || $('wVideo');
    box.textContent = '';
    const f = el('iframe'); f.src = src; f.allow = ALLOW; f.allowFullscreen = true; f.title = 'Livestream'; f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.appendChild(f);
    if (openUrl && !target) $('wOpenYt').href = openUrl;
  }
  let streamToken = 0;
  /** Sender ohne feste Kanal-ID: Jarvis sucht den gerade laufenden Livestream (braucht YOUTUBE_API_KEY). */
  async function selectDynamic(c, i) {
    for (const [n, b] of [...$('wTabs').children].entries()) b.classList.toggle('on', n === i);
    const box = $('wVideo'); box.textContent = '';
    const msg = el('div', 'w-video-msg', 'Suche den laufenden Livestream von ' + c.name + ' …'); box.appendChild(msg);
    $('wOpenYt').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(c.name.replace(/\(.*\)/, '') + ' live') + '&sp=EgJAAQ%3D%3D';
    const token = ++streamToken;
    try {
      const r = await api('/api/world/stream?key=' + encodeURIComponent(c.key));
      if (token !== streamToken) return;
      if (r.live) playEmbed('https://www.youtube-nocookie.com/embed/' + r.live.videoId + '?autoplay=1&mute=1&rel=0', 'https://www.youtube.com/watch?v=' + r.live.videoId);
      else msg.textContent = r.error === 'nokey' ? 'Für diesen Sender fehlt YOUTUBE_API_KEY in der .env. Unten „In YouTube öffnen“ oder eigenen Link einfügen.' : c.name + ' sendet gerade keinen einbettbaren Livestream auf YouTube.';
    } catch (e) { if (token === streamToken) msg.textContent = e.message; }
  }
  function selectChannel(i) {
    const c = CHANNELS[i];
    if (c.key) { selectDynamic(c, i); return; }
    for (const [n, b] of [...$('wTabs').children].entries()) b.classList.toggle('on', n === i);
    playEmbed('https://www.youtube-nocookie.com/embed/live_stream?channel=' + c.id + '&autoplay=1&mute=1&rel=0', 'https://www.youtube.com/channel/' + c.id + '/live');
  }
  function buildTabs() {
    CHANNELS.forEach((c, i) => { const b = el('button', '', c.name); b.type = 'button'; b.onclick = () => selectChannel(i); $('wTabs').appendChild(b); });
  }
  /** Video-ID oder Kanal-ID aus einem YouTube-Link. */
  function parseYoutube(text) {
    let u; try { u = new URL(String(text).trim()); } catch (e) { return null; }
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
    const idOk = (s) => /^[\w-]{11}$/.test(s || '');
    if (u.hostname.endsWith('youtu.be') && idOk(u.pathname.slice(1))) return { video: u.pathname.slice(1) };
    if (idOk(u.searchParams.get('v'))) return { video: u.searchParams.get('v') };
    const m = u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/); if (m) return { video: m[1] };
    const c = u.pathname.match(/^\/channel\/(UC[\w-]{22})/); if (c) return { channel: c[1] };
    return null;
  }
  $('wCustom').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = parseYoutube($('wCustomUrl').value);
    if (!p) { status('Das ist kein gültiger YouTube-Link (Video oder /channel/…).'); return; }
    for (const b of $('wTabs').children) b.classList.remove('on');
    if (p.video) playEmbed('https://www.youtube-nocookie.com/embed/' + p.video + '?autoplay=1&rel=0', 'https://www.youtube.com/watch?v=' + p.video);
    else playEmbed('https://www.youtube-nocookie.com/embed/live_stream?channel=' + p.channel + '&autoplay=1&rel=0', 'https://www.youtube.com/channel/' + p.channel + '/live');
  });

  // ---------- Status ----------
  let statusTimer = 0;
  function status(text) { $('wStatus').textContent = text; clearTimeout(statusTimer); }

  // ---------- Schlagzeilen ----------
  const ago = (ts) => { if (!ts) return ''; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' Tg.'; };
  async function loadNews() {
    try {
      const { items } = await api('/api/world/news');
      const ul = $('wNews'); ul.textContent = '';
      for (const i of items) {
        const li = el('li'); const a = el('a', '', i.title); a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        li.append(a, el('span', 'src', i.source + (i.ts ? ' · ' + ago(i.ts) : ''))); ul.appendChild(li);
      }
      $('wNewsAge').textContent = 'aktualisiert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('wNews').textContent = '';
      $('wNews').appendChild(el('li', '', e.code === 401 ? 'Bitte zuerst Jarvis öffnen und den Zugangs-Token eingeben.' : 'Schlagzeilen gerade nicht erreichbar.'));
    }
  }

  // ---------- Weltkugel ----------
  const CONTINENTS = {
    Europa: { key: 'europa', color: '61,155,255', label: [54, 15], area: '10,2', note: 'vom Atlantik bis zum Ural' },
    Asien: { key: 'asien', color: '255,159,67', label: [45, 90], area: '44,6', note: 'größter Kontinent' },
    Afrika: { key: 'afrika', color: '255,209,102', label: [3, 20], area: '30,4', note: '' },
    Nordamerika: { key: 'nordamerika', color: '61,240,255', label: [45, -100], area: '24,7', note: 'inklusive Mittelamerika und Karibik' },
    'Südamerika': { key: 'suedamerika', color: '61,220,151', label: [-15, -60], area: '17,8', note: '' },
    Ozeanien: { key: 'ozeanien', color: '199,125,255', label: [-25, 135], area: '8,5', note: 'Australien, Neuseeland und die Inseln des Pazifiks' },
    Antarktis: { key: 'antarktis', color: '230,250,255', label: [-80, 0], area: '14,2', note: 'Eisfläche, keine ständige Bevölkerung' },
  };
  const VIEWS = {
    asien: { lat: 38, lng: 90, altitude: 1.9 }, afrika: { lat: 2, lng: 20, altitude: 1.9 }, nordamerika: { lat: 42, lng: -100, altitude: 1.9 },
    suedamerika: { lat: -15, lng: -60, altitude: 1.9 }, ozeanien: { lat: -25, lng: 140, altitude: 1.9 }, antarktis: { lat: -82, lng: 0, altitude: 2.0 }, welt: { lat: 20, lng: 10, altitude: 2.4 }, europa: { lat: 50, lng: 14, altitude: 1.15 }, ukraine: { lat: 49, lng: 32, altitude: 0.75 }, nahost: { lat: 31.5, lng: 38, altitude: 0.95 } };
  let globe = null, cams = [], events = [], countries = [], hoverCont = null, selectedCont = null, depth = 1;   // depth: 3D-Höhe (1 = Standard)
  const SKINS = { satellit: 'vendor/earth-blue-marble.jpg', nacht: 'vendor/earth-night.jpg', dunkel: 'vendor/earth-dark.jpg', karte: 'vendor/earth-blue-marble.jpg', hd: 'vendor/earth-blue-marble.jpg' };
  // Kachel-Karten laden beim Heranzoomen immer schärfere Bilder (Echtzeit-Streaming aus dem Netz)
  const TILES = {
    karte: { url: (x, y, l) => 'https://tile.openstreetmap.org/' + l + '/' + x + '/' + y + '.png', max: 18, credit: '© OpenStreetMap-Mitwirkende (Städte, Dörfer, Straßen)' },
    hd: { url: (x, y, l) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + l + '/' + y + '/' + x, max: 17, credit: 'Bilder: Esri, Maxar, Earthstar Geographics' },
  };
  let skin = 'satellit', altitudeNow = 2.4;
  const DETAIL_ALT = 0.35;   // darunter werden Kontinentflächen ausgeblendet, damit Städte und Dörfer sichtbar sind
  const pointAlt = (p) => (p.kind === 'cam' ? 0.02 * depth : 0.015 + Math.min(0.22, Math.log10(p.count + 1) * 0.07) * depth);
  const polyAlt = (f) => (f.properties.continent === hoverCont || f.properties.continent === selectedCont ? 0.028 : 0.006) * depth;
  const contByKey = Object.fromEntries(Object.entries(CONTINENTS).map(([n, c]) => [c.key, n]));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let camToken = 0;
  function showInfo(p) {
    const box = $('wInfo'); box.textContent = ''; box.hidden = false;
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.onclick = () => { box.hidden = true; };
    box.appendChild(x);
    if (p.kind === 'cam') {
      box.append(el('h3', '', p.name), el('div', 'sub', p.land + (p.art === 'krise' ? ' · Krisenregion' : ' · Stadt')));
      const holder = el('div'); box.appendChild(holder);
      const note = el('div', 'sub', 'Suche nach einer laufenden Live-Cam …'); box.appendChild(note);
      const search = el('a', '', 'Live-Cams bei YouTube suchen'); search.href = p.suche; search.target = '_blank'; search.rel = 'noopener noreferrer';
      const show = (id, text) => { playEmbed('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&rel=0', '', holder); note.textContent = text; };
      if (p.youtube && /^[\w-]{11}$/.test(p.youtube)) { show(p.youtube, 'Feste Live-Cam'); box.appendChild(search); }
      else {
        const token = ++camToken;
        api('/api/world/cam?name=' + encodeURIComponent(p.name)).then((r) => {
          if (token !== camToken) return;
          if (r.live) show(r.live.videoId, 'Live: ' + r.live.title + ' (' + r.live.channel + ')');
          else if (r.error === 'nokey') note.textContent = 'Für automatische Live-Cams fehlt YOUTUBE_API_KEY in der .env. Bis dahin: Suche öffnen.';
          else note.textContent = 'Gerade keine einbettbare Live-Cam gefunden.';
        }).catch((e) => { if (token === camToken) note.textContent = e.message; });
        box.appendChild(search);
      }
      box.appendChild(el('div', 'sub', 'Ohne Gewähr, Cams können offline sein.'));
    } else {
      box.append(el('h3', '', p.name), el('div', 'sub', p.count + ' Meldungen in den letzten 24 Stunden (GDELT)'));
      for (const l of p.links) { const a = el('a', '', l.title); a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.appendChild(a); }
    }
  }
  function selectContinent(name) {
    const c = CONTINENTS[name]; if (!c) return;
    selectedCont = name; refreshPolygons();
    const list = countries.filter((f) => f.properties.continent === name).map((f) => f.properties.name).sort((a, b) => a.localeCompare(b, 'de'));
    const box = $('wInfo'); box.textContent = ''; box.hidden = false;
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.onclick = () => { box.hidden = true; selectedCont = null; refreshPolygons(); };
    box.append(x, el('h3', '', name), el('div', 'sub', 'ca. ' + c.area + ' Mio. km²' + (list.length ? ' · ' + list.length + ' Länder/Gebiete in der Karte' : '') + (c.note ? ' · ' + c.note : '')));
    if (list.length) box.appendChild(el('div', 'sub', list.slice(0, 14).join(', ') + (list.length > 14 ? ' … +' + (list.length - 14) : '')));
    const nPts = cams.filter((p) => p.lat != null && continentOfPoint(p) === name).length;
    if (nPts) box.appendChild(el('div', 'sub', nPts + ' Live-Cam-Orte in dieser Region'));
    for (const b of document.querySelectorAll('.w-regions button')) b.classList.toggle('on', b.dataset.region === c.key);
    if (globe) globe.pointOfView(VIEWS[c.key] || VIEWS.europa, 1200);
  }
  /** Nächster Kontinent-Mittelpunkt (für die Zählung der Cam-Orte). */
  function continentOfPoint(p) {
    let best = null, bd = Infinity;
    for (const [n, c] of Object.entries(CONTINENTS)) { const d = Math.hypot(p.lat - c.label[0], (p.lng - c.label[1]) * Math.cos(p.lat * Math.PI / 180)); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function refreshPolygons() {
    if (!globe) return;
    const show = $('tCont').checked && altitudeNow > DETAIL_ALT;
    globe.polygonsData(show ? countries : []);
    globe.labelsData(show ? Object.entries(CONTINENTS).map(([name, c]) => ({ name, lat: c.label[0], lng: c.label[1], color: 'rgba(' + c.color + ',0.95)' })) : []);
  }
  function setSkin(name) {
    if (!globe || !SKINS[name]) return;
    skin = name;
    globe.globeImageUrl(SKINS[name]);
    const t = TILES[name];
    if (t) { globe.globeTileEngineUrl(t.url).globeTileEngineMaxLevel(t.max); }
    else { globe.globeTileEngineUrl(null); if (globe.globeTileEngineClearCache) globe.globeTileEngineClearCache(); }
    $('wCredit').textContent = t ? t.credit : ''; $('wCredit').hidden = !t;
    for (const x of document.querySelectorAll('.w-3d-row button')) x.classList.toggle('on', x.dataset.skin === name);
  }

  // Ort per Klick: nächste Stadt/Dorf (OpenStreetMap Nominatim, nur bei Klick). Dabei wird auf die Detail-Karte gezoomt.
  let placeToken = 0;
  async function inspectPlace(lat, lng, opts) {
    const o = opts || {};
    if (!TILES[skin]) setSkin('karte');
    if (globe) {
      const c = globe.controls(); c.autoRotate = false; $('tSpin').checked = false;
      c.enableDamping = false;                                  // Schwung der Drehung stoppen, sonst landet der Flug neben dem Ziel
      globe.pointOfView({ lat, lng, altitude: o.altitude || 0.12 }, 1600);
      setTimeout(() => { c.enableDamping = true; }, 1900);
    }
    const box = $('wInfo'); box.textContent = ''; box.hidden = false;
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Schließen'); x.onclick = () => { box.hidden = true; };
    const h = el('h3', '', o.title || 'Ort wird gesucht …'); const sub = el('div', 'sub', lat.toFixed(4) + '°, ' + lng.toFixed(4) + '°');
    box.append(x, h, sub);
    const token = ++placeToken;
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=de&lat=' + lat + '&lon=' + lng, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (token !== placeToken) return;
      if (d.error || !d.address) { h.textContent = o.title || 'Kein Ort an dieser Stelle'; sub.textContent += ' · Meer oder unbewohntes Gebiet'; return; }
      const a = d.address;
      const name = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county || d.name || 'Unbekannter Ort';
      h.textContent = o.title || name;
      const area = [a.state || a.region, a.country].filter(Boolean).join(', ');
      sub.textContent = (area ? area + ' · ' : '') + lat.toFixed(4) + '°, ' + lng.toFixed(4) + '°';
      box.appendChild(el('div', 'sub', 'Tipp: Mit dem Mausrad weiter hineinzoomen, bis einzelne Straßen und Häuser sichtbar sind.'));
    } catch (e) { if (token === placeToken) h.textContent = o.title || 'Ort (Name gerade nicht abrufbar)'; }
  }
  async function searchPlace(q) {
    status('Suche „' + q + '“ …');
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(10000) });
      const [d] = await r.json();
      if (!d) { status('Nichts gefunden für „' + q + '“'); return; }
      const big = ['country', 'state', 'region'].includes(d.addresstype);
      inspectPlace(Number(d.lat), Number(d.lon), { title: d.display_name.split(',')[0], altitude: big ? 0.9 : 0.1 });
      status('');
    } catch (e) { status('Ortssuche gerade nicht erreichbar'); }
  }

  // Echtzeit-Sonne: Tag und Nacht folgen dem echten Sonnenstand (Licht über dem Subsolarpunkt)
  function sunPosition(date) {
    const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;        // Tage seit J2000
    const g = (357.529 + 0.98560028 * d) * Math.PI / 180;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    const e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;   // Stunden
    let lng = ra * 180 / Math.PI - gmst * 15; lng = ((lng + 540) % 360) - 180;
    return { lat: dec * 180 / Math.PI, lng };
  }
  function applySun() {
    if (!globe) return;
    const on = $('tSun').checked;
    const lights = globe.scene().children.filter((c) => c.isLight);
    const dir = lights.find((l) => l.isDirectionalLight), amb = lights.find((l) => l.isAmbientLight);
    if (!dir) return;
    if (on) {
      const p = sunPosition(new Date()); const c = globe.getCoords(p.lat, p.lng, 3);
      dir.position.set(c.x, c.y, c.z); dir.intensity = 1.5;
      if (amb) amb.intensity = 0.55;
      window.__sun = p;
    } else { dir.position.set(-300, 200, 400); dir.intensity = 1; if (amb) amb.intensity = 1; }
  }
  function refreshPoints() {
    if (!globe) return;
    const pts = [];
    if ($('tCams').checked) pts.push(...cams);
    if ($('tEvents').checked) pts.push(...events);
    globe.pointsData(pts);
    globe.ringsData($('tEvents').checked ? events.slice(0, 12) : []);
  }
  function goto(region) {
    const v = VIEWS[region] || VIEWS.europa;
    for (const b of document.querySelectorAll('.w-regions button')) b.classList.toggle('on', b.dataset.region === region);
    if (contByKey[region]) { selectContinent(contByKey[region]); return; }
    if (globe) globe.pointOfView(v, 1400);
  }
  function initGlobe() {
    const host = $('globe');
    if (typeof window.Globe !== 'function') { $('wFallback').hidden = false; $('wFallback').textContent = 'Die Weltkugel konnte nicht geladen werden (Bibliothek fehlt). Livestream und Schlagzeilen funktionieren trotzdem.'; return; }
    try {
      globe = window.Globe()(host)
        .globeImageUrl('vendor/earth-blue-marble.jpg').bumpImageUrl('vendor/earth-topology.png').backgroundImageUrl('vendor/night-sky.png')
        .showAtmosphere(true).atmosphereColor('#3df0ff').atmosphereAltitude(0.18)
        .pointLat('lat').pointLng('lng')
        .pointColor((p) => (p.kind === 'cam' ? '#3df0ff' : '#ff5c5c'))
        .pointRadius((p) => (p.kind === 'cam' ? 0.28 : Math.min(1.1, 0.25 + Math.log10(p.count + 1) * 0.3)))
        .pointAltitude(pointAlt)
        .pointLabel((p) => p.name)
        .onPointClick((p) => { showInfo(p); globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.6 }, 1000); })
        .polygonCapColor((f) => { const c = CONTINENTS[f.properties.continent]; const on = f.properties.continent === hoverCont || f.properties.continent === selectedCont; return 'rgba(' + c.color + ',' + (on ? 0.42 : 0.13) + ')'; })
        .polygonSideColor((f) => 'rgba(' + CONTINENTS[f.properties.continent].color + ',0.18)')
        .polygonStrokeColor((f) => 'rgba(' + CONTINENTS[f.properties.continent].color + ',0.75)')
        .polygonAltitude(polyAlt)
        .polygonsTransitionDuration(300)
        .polygonLabel((f) => '<b>' + esc(f.properties.name) + '</b><br><span style="opacity:.75">' + esc(f.properties.continent) + '</span>')
        .onPolygonHover((f) => { const n = f ? f.properties.continent : null; if (n !== hoverCont) { hoverCont = n; globe.polygonsData(globe.polygonsData()); } })
        .onPolygonClick((f, ev, c) => { if (c && Number.isFinite(c.lat)) inspectPlace(c.lat, c.lng); else selectContinent(f.properties.continent); })
        .onGlobeClick(({ lat, lng }) => inspectPlace(lat, lng))
        .onLabelClick((l) => selectContinent(l.name))
        .onZoom((pov) => { const was = altitudeNow > DETAIL_ALT; altitudeNow = pov.altitude; if (was !== (altitudeNow > DETAIL_ALT)) refreshPolygons(); })
        .labelLat('lat').labelLng('lng').labelText('name').labelColor('color').labelSize(1.5).labelAltitude(0.03).labelDotRadius(0).labelResolution(2)
        .ringsData([]).ringColor(() => (t) => 'rgba(255,92,92,' + (1 - t) + ')').ringMaxRadius(3).ringPropagationSpeed(1.5).ringRepeatPeriod(1400)
        .ringLat('lat').ringLng('lng');
      const gl = globe.renderer().getContext();
      const dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      const soft = /swiftshader|llvmpipe|software|softpipe/i.test(name);
      globe.renderer().setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
      const c = globe.controls(); c.autoRotate = true; c.autoRotateSpeed = soft ? 0.25 : 0.45; c.enableDamping = true; c.minDistance = 100.4;
      const fit = () => globe.width(host.clientWidth).height(host.clientHeight);
      new ResizeObserver(fit).observe(host); fit();
      $('tSpin').addEventListener('change', () => { c.autoRotate = $('tSpin').checked; });
      c.addEventListener('start', () => { c.autoRotate = false; $('tSpin').checked = false; });
      // 3D: Relief (Bump-Map) kräftiger machen, Kontinente und Ereignis-Säulen in die Höhe bauen
      const mat = globe.globeMaterial(); mat.bumpScale = 10;
      function apply3d() {
        const v = Number($('r3d').value);
        depth = v / 40;
        mat.bumpScale = v / 4;
        globe.polygonAltitude(polyAlt).pointAltitude(pointAlt);
      }
      $('r3d').addEventListener('input', apply3d);
      for (const b of document.querySelectorAll('.w-3d-row button')) b.addEventListener('click', () => {
        setSkin(b.dataset.skin);
      });
      setTimeout(applySun, 300); setInterval(applySun, 60000); $('tSun').addEventListener('change', applySun);
      window.__welt = { globe, soft, setSkin, inspectPlace, applySun, sunPosition, getSkin: () => skin, apply3d, getDepth: () => depth, showInfo: (p) => showInfo(p), selectContinent: (n) => selectContinent(n) };
    } catch (err) {
      globe = null; console.error('[Welt] Globus konnte nicht starten', err);
      $('wFallback').hidden = false; $('wFallback').textContent = 'Die 3D-Weltkugel braucht WebGL und startet hier nicht. Livestream und Schlagzeilen funktionieren trotzdem.';
    }
  }

  async function loadGlobeData() {
    try {
      const data = await (await fetch('world/cams.json')).json();
      cams = (data.cams || []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((c) => ({ ...c, kind: 'cam' }));
    } catch (e) { cams = []; }
    try { countries = (await (await fetch('world/continents.json')).json()).features || []; } catch (e) { countries = []; }
    refreshPolygons();
    if (new URLSearchParams(location.search).get('region') && contByKey[new URLSearchParams(location.search).get('region')]) selectContinent(contByKey[new URLSearchParams(location.search).get('region')]);
    try { events = (await api('/api/world/events')).points.map((p) => ({ ...p, kind: 'event' })); }
    catch (e) { events = []; status(e.code === 401 ? 'Token fehlt: erst Jarvis öffnen.' : 'Krisenmeldungen gerade nicht erreichbar'); }
    refreshPoints();
    if (events.length || cams.length) status(cams.length + ' Live-Cam-Orte · ' + events.length + ' Krisenmeldungen');
  }

  // ---------- Start ----------
  buildTabs(); selectChannel(0);
  initGlobe();
  for (const b of document.querySelectorAll('.w-regions button')) b.addEventListener('click', () => goto(b.dataset.region));
  $('wSearch').addEventListener('submit', (e) => { e.preventDefault(); const q = $('wSearchQ').value.trim(); if (q) searchPlace(q); });
  $('tCont').addEventListener('change', refreshPolygons);
  $('tCams').addEventListener('change', refreshPoints); $('tEvents').addEventListener('change', refreshPoints);
  const region = new URLSearchParams(location.search).get('region');
  goto(VIEWS[region] ? region : 'europa');
  loadGlobeData(); loadNews();
  setInterval(loadNews, 5 * 60 * 1000); setInterval(loadGlobeData, 10 * 60 * 1000);
})();
