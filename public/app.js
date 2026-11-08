/* JARVIS – Browser-Frontend. Alle KI-Logik, Werkzeuge und Daten liegen auf dem Server (/api/*). */
(function () {
  const $ = (id) => document.getElementById(id);
  const micBtn = $('micBtn'), textInput = $('textInput'), dialog = $('dialog'), stateLabel = $('stateLabel');
  const goalPanel = $('goalPanel'), goalText = $('goalText');
  const unsupported = $('unsupported'), orbCanvas = $('orb');
  const apiOverlay = $('apiOverlay'), tokenInput = $('tokenInput'), tokenSaveBtn = $('tokenSaveBtn'), tokenError = $('tokenError');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null, listening = false, interimBubble = null, deVoice = null;
  let TOKEN = '';
  try { TOKEN = localStorage.getItem('jarvis_token') || ''; } catch (e) {}

  // ---------- Server ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    });
    if (res.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Fehler ' + res.status); e.code = res.status; throw e; }
    return data;
  }

  // ---------- Zugang ----------
  function askToken(msg) {
    tokenError.textContent = msg || '';
    apiOverlay.style.display = 'flex';
    tokenInput.focus();
  }
  tokenSaveBtn.addEventListener('click', async () => {
    TOKEN = tokenInput.value.trim();
    try {
      await api('/api/state');
      try { localStorage.setItem('jarvis_token', TOKEN); } catch (e) {}
      apiOverlay.style.display = 'none';
      await boot(true);
    } catch (e) { askToken(e.code === 401 ? 'Token ist falsch.' : e.message); }
  });
  tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tokenSaveBtn.click(); });

  // ---------- Sprachausgabe ----------
  function pickVoice() {
    const voices = synth.getVoices();
    deVoice = voices.find(v => /de(-|_)?/i.test(v.lang) && /google|microsoft/i.test(v.name))
           || voices.find(v => /de(-|_)?/i.test(v.lang)) || voices[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  let voiceOn = false, currentAudio = null, speakSeq = 0;
  const isSpeaking = () => !!currentAudio || !!(synth && synth.speaking);

  function startedSpeaking() {
    setState('speaking');
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
  }
  function doneSpeaking() {
    setState(listening ? 'listening' : 'idle');
    if (listening) restartRecognition();
  }
  function stopSpeaking() {
    speakSeq++;
    synth && synth.cancel();
    if (currentAudio) { const a = currentAudio; currentAudio = null; a.pause(); }
  }

  function speakBrowser(text) {
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    if (deVoice) u.voice = deVoice;
    u.lang = 'de-DE'; u.rate = 1.02; u.pitch = 0.9;
    u.onstart = startedSpeaking;
    u.onend = doneSpeaking;
    u.onerror = doneSpeaking;
    synth.speak(u);
  }

  // Server-Stimme (ElevenLabs); bei jedem Fehler fällt JARVIS auf die Browser-Stimme zurück
  async function speak(text) {
    stopSpeaking();
    const seq = speakSeq;
    if (voiceOn) {
      try {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
          body: JSON.stringify({ text: text.slice(0, 800) }),
        });
        if (!res.ok) throw new Error('speak ' + res.status);
        const blob = await res.blob();
        if (seq !== speakSeq) return;              // inzwischen wurde etwas anderes angefordert
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const finish = () => { URL.revokeObjectURL(url); if (currentAudio === audio) { currentAudio = null; doneSpeaking(); } };
        audio.onended = finish; audio.onerror = finish;
        currentAudio = audio;
        startedSpeaking();
        await audio.play();
        return;
      } catch (e) {
        if (seq !== speakSeq) return;
        currentAudio = null;
      }
    }
    speakBrowser(text);
  }

  // ---------- UI ----------
  function setState(mode) {
    window.Orb && window.Orb.setMode(mode);
    const labels = { idle: 'Bereit', listening: 'Höre zu…', thinking: 'Verarbeite…', speaking: 'Spreche…' };
    stateLabel.textContent = labels[mode] || '';
  }
  function addBubble(text, who, interim) {
    const b = document.createElement('div');
    b.className = 'bubble ' + who + (interim ? ' interim' : '');
    b.textContent = text;
    dialog.appendChild(b);
    while (dialog.children.length > 10) dialog.removeChild(dialog.firstChild);
    return b;
  }
  function jarvisSay(text) { addBubble(text, 'jarvis'); speak(text); }

  const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---------- Widgets ----------
  const RING = 263.9;                       // Umfang des SVG-Rings (r=42)
  const setRing = (id, frac) => {
    const el = document.querySelector('#' + id + ' .fill');
    if (el) el.style.strokeDashoffset = String(RING * (1 - Math.max(0, Math.min(1, frac))));
  };
  const SEGMENTS = 20;
  const bar = $('doneBar');
  for (let i = 0; i < SEGMENTS; i++) bar.appendChild(document.createElement('i'));
  const dayKey = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  const clock = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  function renderState(s) {
    if (!s) return;
    if (s.userName) USER_NAME = s.userName;

    // Ziel
    if (s.goal) {
      goalText.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = s.goal.text.slice(0, 90);
      goalText.appendChild(strong);
      if (s.goal.realisierbarkeit != null) goalText.append(` · ${s.goal.realisierbarkeit}% realisierbar`);
      goalPanel.classList.add('show');
    } else goalPanel.classList.remove('show');

    // Erledigt-Quote
    const done = s.stats ? s.stats.done : 0;
    const total = s.stats ? s.stats.total : s.tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('donePct').textContent = pct;
    $('doneCount').textContent = `${done}/${total}`;
    [...bar.children].forEach((el, i) => el.classList.toggle('on', i < Math.round((pct / 100) * SEGMENTS)));

    // Heute geplant (Erinnerungen von heute)
    const now = new Date(), today = dayKey(now);
    const todays = s.reminders.filter(r => dayKey(new Date(r.at)) === today);
    const list = $('planList');
    list.textContent = '';
    if (!todays.length) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Heute nichts geplant.'; list.appendChild(li);
    }
    todays.slice(0, 4).forEach(r => {
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className = 'dot';
      const t = document.createElement('time'); t.textContent = clock(new Date(r.at));
      const tx = document.createElement('span'); tx.className = 't'; tx.textContent = r.text;
      li.append(dot, t, tx); list.appendChild(li);
    });
    $('planNum').textContent = todays.length;
    setRing('planRing', todays.length ? Math.min(1, todays.length / 4) : 0);

    // Offene Aufgaben
    $('taskNum').textContent = s.tasks.length;
    setRing('taskRing', total ? s.tasks.length / total : 0);

    // Diese Woche: Termine Mo–So
    const monday = new Date(now); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 7);
    const week = s.reminders.filter(r => { const d = new Date(r.at); return d >= monday && d < sunday; });
    $('weekNum').textContent = week.length;
    const days = $('weekDays'); days.textContent = '';
    ['M', 'D', 'M', 'D', 'F', 'S', 'S'].forEach((ch, i) => {
      const day = new Date(monday); day.setDate(monday.getDate() + i);
      const wrap = document.createElement('div');
      if (dayKey(day) === today) wrap.className = 'today';
      const dot = document.createElement('span'); dot.className = 'd' + (week.some(r => dayKey(new Date(r.at)) === dayKey(day)) ? ' on' : '');
      const l = document.createElement('span'); l.textContent = ch;
      wrap.append(l, dot); days.appendChild(wrap);
    });

    // Nächstes
    const next = s.tasks[0];
    $('nextTitle').textContent = next ? next.text : 'Keine offenen Aufgaben';
    $('nextSub').textContent = next ? (next.due ? 'Fällig: ' + next.due : 'Ohne Fälligkeit') : 'Sag „Neue Aufgabe …“, um eine anzulegen.';
  }

  // ---------- Datum + Sternenhimmel ----------
  function tickDate() {
    $('dateLabel').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  }
  tickDate(); setInterval(tickDate, 60000);

  (function stars() {
    const c = $('stars'), g = c.getContext('2d');
    let pts = [];
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = innerWidth * dpr; c.height = innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: Math.round(innerWidth * innerHeight / 9000) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.2 + 0.2, p: Math.random() * 6.28 }));
    };
    size(); addEventListener('resize', size);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (t) => {
      g.clearRect(0, 0, innerWidth, innerHeight);
      pts.forEach(p => { g.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(p.p + t / 1800)); g.fillStyle = '#cfe0ff'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill(); });
      if (!reduce) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  })();

  // ---------- Gespräch ----------
  async function respond(text) {
    setState('thinking');
    try {
      const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, offsetMinutes: new Date().getTimezoneOffset() }) });
      renderState(data.state);
      jarvisSay(data.reply);
    } catch (err) {
      if (err.code === 401) { askToken('Bitte Zugangs-Token eingeben.'); setState('idle'); return; }
      jarvisSay('Das hat nicht geklappt. ' + (err.message || '') );
      setState('idle');
    }
  }
  function handleInput(text) {
    text = text.trim();
    if (!text) return;
    addBubble(text, 'user');
    respond(text);
  }

  // ---------- Erinnerungen vom Server abholen ----------
  async function poll() {
    try {
      const data = await api('/api/poll');
      renderState(data.state);
      data.fired.forEach(r => jarvisSay('Erinnerung: ' + r.text));
      if (data.fired.length && window.Notification && Notification.permission === 'granted') {
        data.fired.forEach(r => { try { new Notification('JARVIS', { body: r.text }); } catch (e) {} });
      }
    } catch (e) { /* offline oder Token fehlt – nächster Versuch folgt */ }
  }
  setInterval(() => { if (apiOverlay.style.display === 'none') poll(); }, 10000);

  // ---------- Mikrofon-Pegel ----------
  let audioCtx = null, analyser = null, micData = null, rafId = null;
  async function startMicMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      micData = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(micData);
        let sum = 0;
        for (let i = 0; i < micData.length; i++) sum += micData[i];
        window.Orb && window.Orb.setAudioLevel((sum / micData.length) / 128);
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {}
  }
  function stopMicMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    window.Orb && window.Orb.setAudioLevel(0);
  }

  // ---------- Spracherkennung mit Wake-Word "Hey Jarvis" ----------
  let USER_NAME = 'Augustin';
  const WAKE_RE = /(?:dsch|tsch|sch|j|y)ar[vw][iy]s+/i;   // erkennt auch "Dscharvis", "Jarwis" …
  let armedUntil = 0;           // bis wann JARVIS auf einen Befehl wartet
  const ARM_MS = 10000;

  function restartRecognition() {
    if (!recognition || !listening || isSpeaking()) return;
    setTimeout(() => {
      if (!listening || isSpeaking()) return;
      try { recognition.start(); } catch (e) {}
    }, 250);
  }

  function onFinalSpeech(raw) {
    const text = raw.trim();
    if (!text) return;
    const m = text.match(WAKE_RE);
    if (m) {
      // alles nach dem Wake-Word ist der Befehl
      const cmd = text.slice(m.index + m[0].length).replace(/^[\s,.:!?-]+/, '');
      if (cmd.length > 2) { armedUntil = 0; handleInput(cmd); }
      else { armedUntil = Date.now() + ARM_MS; jarvisSay(`Ja, ${USER_NAME}?`); }
      return;
    }
    if (Date.now() < armedUntil) { armedUntil = 0; handleInput(text); }
    // sonst: Gespräch im Raum ignorieren
  }

  function initRecognition() {
    if (!SR) { unsupported.style.display = 'flex'; return; }
    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim && (Date.now() < armedUntil || WAKE_RE.test(interim))) {
        if (!interimBubble) interimBubble = addBubble(interim, 'user', true);
        else interimBubble.textContent = interim;
      }
      if (final) {
        if (interimBubble) { interimBubble.remove(); interimBubble = null; }
        onFinalSpeech(final);
      }
    };
    recognition.onend = () => {
      if (interimBubble) { interimBubble.remove(); interimBubble = null; }
      if (listening) { restartRecognition(); return; }
      micBtn.classList.remove('active');
      stopMicMeter();
      if (window.Orb.getMode() !== 'speaking') setState('idle');
    };
    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listening = false; micBtn.classList.remove('active'); stopMicMeter(); setState('idle');
        addBubble('Mikrofon-Zugriff wurde blockiert. Bitte im Browser erlauben.', 'jarvis');
      }
      // andere Fehler (no-speech, aborted): onend startet neu
    };
  }

  function startListening() {
    if (!recognition || listening) return;
    listening = true;
    micBtn.classList.add('active');
    setState('listening');
    startMicMeter();
    try { recognition.start(); } catch (e) {}
  }
  function stopListening() {
    listening = false;
    armedUntil = 0;
    try { recognition.stop(); } catch (e) {}
    micBtn.classList.remove('active');
    stopMicMeter();
    setState('idle');
  }

  function toggleListen() {
    if (apiOverlay.style.display !== 'none') return;
    if (!recognition) { textInput.focus(); return; }
    if (listening) {
      // Klick während Dauer-Hören: sofort Befehl annehmen, zweiter Klick beendet das Hören
      if (Date.now() < armedUntil) { stopListening(); return; }
      stopSpeaking();
      armedUntil = Date.now() + ARM_MS;
      setState('listening');
      restartRecognition();
      return;
    }
    stopSpeaking();
    armedUntil = Date.now() + ARM_MS;
    startListening();
  }

  micBtn.addEventListener('click', toggleListen);
  orbCanvas.addEventListener('click', toggleListen);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { handleInput(textInput.value); textInput.value = ''; }
  });

  initRecognition();
  setState('idle');

  // ---------- Start ----------
  let greeted = false;
  function greetOnce(ev) {
    if (greeted) return; greeted = true;
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    // Klick auf Mikro/Orb startet das Hören selbst – dann keine Begrüßung
    if (ev && ev.target && (ev.target === micBtn || micBtn.contains(ev.target) || ev.target === orbCanvas)) return;
    startListening();
    jarvisSay(`Systeme online, ${USER_NAME}. Sag Hey Jarvis, wenn du mich brauchst.`);
  }

  async function boot(afterToken) {
    let health;
    try { health = await api('/api/health'); } catch (e) { addBubble('Server nicht erreichbar.', 'jarvis'); return; }
    voiceOn = !!health.voice;
    if (!health.keyConfigured) addBubble('Auf dem Server fehlt ANTHROPIC_API_KEY. Ohne ihn kann ich nicht antworten.', 'jarvis');
    try {
      renderState(await api('/api/state'));
      apiOverlay.style.display = 'none';
    } catch (e) {
      if (e.code === 401) { askToken(TOKEN ? 'Token ist falsch.' : ''); return; }
    }
    if (afterToken) { greeted = false; greetOnce(); }
    else window.addEventListener('pointerdown', greetOnce, { once: true });
  }
  boot(false);
})();
