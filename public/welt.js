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
  function selectChannel(i) {
    const c = CHANNELS[i];
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
  const VIEWS = { welt: { lat: 20, lng: 10, altitude: 2.4 }, europa: { lat: 50, lng: 14, altitude: 1.15 }, ukraine: { lat: 49, lng: 32, altitude: 0.75 }, nahost: { lat: 31.5, lng: 38, altitude: 0.95 } };
  let globe = null, cams = [], events = [];

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
        .pointAltitude((p) => (p.kind === 'cam' ? 0.02 : 0.015))
        .pointLabel((p) => p.name)
        .onPointClick((p) => { showInfo(p); globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: 0.6 }, 1000); })
        .ringsData([]).ringColor(() => (t) => 'rgba(255,92,92,' + (1 - t) + ')').ringMaxRadius(3).ringPropagationSpeed(1.5).ringRepeatPeriod(1400)
        .ringLat('lat').ringLng('lng');
      const gl = globe.renderer().getContext();
      const dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      const soft = /swiftshader|llvmpipe|software|softpipe/i.test(name);
      globe.renderer().setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
      const c = globe.controls(); c.autoRotate = true; c.autoRotateSpeed = soft ? 0.25 : 0.45; c.enableDamping = true;
      const fit = () => globe.width(host.clientWidth).height(host.clientHeight);
      new ResizeObserver(fit).observe(host); fit();
      $('tSpin').addEventListener('change', () => { c.autoRotate = $('tSpin').checked; });
      c.addEventListener('start', () => { c.autoRotate = false; $('tSpin').checked = false; });
      window.__welt = { globe, soft, showInfo: (p) => showInfo(p) };
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
    try { events = (await api('/api/world/events')).points.map((p) => ({ ...p, kind: 'event' })); }
    catch (e) { events = []; status(e.code === 401 ? 'Token fehlt: erst Jarvis öffnen.' : 'Krisenmeldungen gerade nicht erreichbar'); }
    refreshPoints();
    if (events.length || cams.length) status(cams.length + ' Live-Cam-Orte · ' + events.length + ' Krisenmeldungen');
  }

  // ---------- Start ----------
  buildTabs(); selectChannel(0);
  initGlobe();
  for (const b of document.querySelectorAll('.w-regions button')) b.addEventListener('click', () => goto(b.dataset.region));
  $('tCams').addEventListener('change', refreshPoints); $('tEvents').addEventListener('change', refreshPoints);
  const region = new URLSearchParams(location.search).get('region');
  goto(VIEWS[region] ? region : 'europa');
  loadGlobeData(); loadNews();
  setInterval(loadNews, 5 * 60 * 1000); setInterval(loadGlobeData, 10 * 60 * 1000);
})();
