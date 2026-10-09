/* JARVIS – Browser-Frontend. Alle KI-Logik, Werkzeuge und Daten liegen auf dem Server (/api/*). */
(function () {
  const $ = (id) => document.getElementById(id);
  const micBtn = $('micBtn'), textInput = $('textInput'), dialog = $('dialog'), stateLabel = $('stateLabel');
  const goalPanel = $('goalPanel'), goalText = $('goalText'), sidePanel = $('sidePanel');
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

  let voiceOn = false, currentAudio = null, speakSeq = 0, audioActive = false;
  const isSpeaking = () => audioActive || !!currentAudio || !!(synth && synth.speaking);

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
    audioActive = false;
    synth && synth.cancel();
    if (currentAudio) { const a = currentAudio; currentAudio = null; a.pause(); }
  }

  function speakBrowser(text) {
    if (!synth) { doneSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (deVoice) u.voice = deVoice;
    u.lang = 'de-DE'; u.rate = 1.02; u.pitch = 0.9;
    u.onstart = startedSpeaking;
    u.onend = doneSpeaking;
    u.onerror = doneSpeaking;
    synth.speak(u);
  }

  // Kurze Sätze zusammenfassen, damit der erste Teil schnell fertig ist und sofort loslaufen kann
  function splitSentences(text) {
    const parts = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text];
    const out = []; let cur = '';
    for (const p of parts) { cur += p; if (cur.trim().length >= 40) { out.push(cur.trim()); cur = ''; } }
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 6);
  }

  async function fetchAudio(text) {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
      body: JSON.stringify({ text: text.slice(0, 800) }),
    });
    if (!res.ok) throw new Error('speak ' + res.status);
    return res.blob();
  }

  function playBlob(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      let done = false;
      const finish = () => { if (done) return; done = true; URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; resolve(); };
      audio.onended = finish; audio.onerror = finish; audio.onpause = finish;
      currentAudio = audio;
      audio.play().catch(finish);
    });
  }

  // Server-Stimme (ElevenLabs), satzweise geladen: Der erste Satz spielt, während die nächsten schon kommen.
  // Bei jedem Fehler spricht JARVIS den Rest mit der Browser-Stimme.
  async function speak(text) {
    stopSpeaking();
    const seq = speakSeq;
    if (!voiceOn) { speakBrowser(text); return; }
    const chunks = splitSentences(text);
    const pending = [];
    const want = (i) => { if (i < chunks.length && !pending[i]) pending[i] = fetchAudio(chunks[i]).catch(() => null); };
    want(0); want(1);
    audioActive = true;
    let started = false;
    for (let i = 0; i < chunks.length; i++) {
      const blob = await pending[i];
      if (seq !== speakSeq) return;
      if (!blob) { audioActive = false; speakBrowser(chunks.slice(i).join(' ')); return; }
      want(i + 2);
      if (!started) { started = true; startedSpeaking(); }
      await playBlob(blob);
      if (seq !== speakSeq) return;
    }
    audioActive = false;
    doneSpeaking();
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
  // Nur http(s)-Links werden zu echten Links; alles andere wird verworfen
  function safeHref(u) {
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch (e) { return ''; }
  }
  function addLinkBubble(name, url) {
    const href = safeHref(url);
    if (!href) return;
    const b = document.createElement('div');
    b.className = 'bubble jarvis';
    const a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Öffnen: ' + name + ' ↗';
    a.style.cssText = 'color:var(--accent);font-weight:600;text-decoration:none';
    b.appendChild(a);
    dialog.appendChild(b);
    while (dialog.children.length > 10) dialog.removeChild(dialog.firstChild);
    // Direktes Öffnen klappt nur, wenn der Browser es erlaubt; der Button bleibt in jedem Fall als Ausweg
    try { window.open(href, '_blank', 'noopener,noreferrer'); } catch (e) {}
  }

  function jarvisSay(text) { addBubble(text, 'jarvis'); speak(text); }

  const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function renderState(s) {
    if (!s) return;
    if (s.userName) USER_NAME = s.userName;
    if (s.goal) {
      goalText.textContent = '';
      const label = document.createTextNode('Ziel: ');
      const strong = document.createElement('strong');
      strong.style.color = '#eafaff';
      strong.textContent = s.goal.text.slice(0, 80);
      goalText.append(label, strong);
      if (s.goal.realisierbarkeit != null) {
        const sp = document.createElement('span');
        sp.style.cssText = 'font-size:11px;color:#6f8aa0;letter-spacing:2px';
        sp.textContent = ` · ${s.goal.realisierbarkeit}% realisierbar`;
        goalText.appendChild(sp);
      }
      goalPanel.classList.add('show');
    }
    sidePanel.textContent = '';
    const section = (title, items) => {
      if (!items.length) return;
      const h = document.createElement('div'); h.className = 'lbl'; h.textContent = title; sidePanel.appendChild(h);
      items.forEach(t => { const d = document.createElement('div'); d.className = 'item'; d.textContent = t; sidePanel.appendChild(d); });
    };
    section('Aufgaben', s.tasks.map(t => '▸ ' + t.text + (t.due ? ` (${t.due})` : '')));
    section('Läuft im Hintergrund', (s.jobs || []).map(t => '⏳ ' + t));
    section('Erinnerungen', s.reminders.map(r => '⏰ ' + fmtTime(r.at) + ' · ' + r.text));
    if ((s.links || []).length) {
      const h = document.createElement('div'); h.className = 'lbl'; h.textContent = 'Schnellzugriff'; sidePanel.appendChild(h);
      const row = document.createElement('div'); row.className = 'item';
      s.links.forEach(l => {
        const href = safeHref(l.url); if (!href) return;
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = l.name;
        a.style.cssText = 'color:var(--accent);margin-right:12px;text-decoration:none';
        row.appendChild(a);
      });
      sidePanel.appendChild(row);
    }
    if (s.factCount) section(`Gedächtnis (${s.factCount})`, s.facts.map(f => '🧠 ' + f));
    sidePanel.classList.toggle('show', !!(s.tasks.length || s.reminders.length || s.factCount || (s.jobs || []).length || (s.links || []).length));
  }

  // ---------- Gespräch ----------
  async function respond(text) {
    setState('thinking');
    try {
      const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, offsetMinutes: new Date().getTimezoneOffset() }) });
      renderState(data.state);
      jarvisSay(data.reply);
      (data.actions || []).forEach(a => { if (a.type === 'open') addLinkBubble(a.name, a.url); });
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
      (data.jobs || []).forEach(j => {
        if (j.status === 'done') {
          addBubble(j.result.slice(0, 900), 'jarvis');
          const lead = j.result.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
          speak(`${USER_NAME}, die Recherche ist fertig: ${j.title}. ${lead}`.slice(0, 600));
        } else jarvisSay(`${USER_NAME}, die Recherche „${j.title}“ hat nicht geklappt.`);
      });
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
