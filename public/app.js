/* JARVIS – Browser-Frontend. Alle KI-Logik, Werkzeuge und Daten liegen auf dem Server (/api/*). */
(function () {
  const $ = (id) => document.getElementById(id);
  const micBtn = $('micBtn'), textInput = $('textInput'), dialog = $('dialog'), composer = $('composer');
  const stateText = $('stateText'), stateDot = $('stateDot'), clockEl = $('clock'), banner = $('banner');
  const unsupported = $('unsupported'), orbCanvas = $('orb');
  const apiOverlay = $('apiOverlay'), tokenInput = $('tokenInput'), tokenSaveBtn = $('tokenSaveBtn'), tokenError = $('tokenError');
  const overlayOpen = () => apiOverlay.classList.contains('show');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const icon = (id) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'i'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; };

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
    apiOverlay.classList.add('show');
    tokenInput.focus();
  }
  tokenSaveBtn.addEventListener('click', async () => {
    TOKEN = tokenInput.value.trim();
    try {
      await api('/api/state');
      try { localStorage.setItem('jarvis_token', TOKEN); } catch (e) {}
      apiOverlay.classList.remove('show');
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

  let voiceOn = false, voiceWarned = false, currentAudio = null, speakSeq = 0;
  const isSpeaking = () => !!currentAudio || !!(synth && synth.speaking);

  function startedSpeaking() {
    setState('speaking');
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
  }
  let armAfterSpeech = false;     // nach der Begrüßung sofort einen Befehl ohne "Hey Jarvis" annehmen
  function doneSpeaking() {
    setState(listening ? 'listening' : 'idle');
    if (armAfterSpeech && listening) { armAfterSpeech = false; armedUntil = Date.now() + ARM_MS; }
    if (listening) restartRecognition();
  }
  function stopSpeaking() {
    speakSeq++;
    synth && synth.cancel();
    if (currentAudio) { const a = currentAudio; currentAudio = null; a.pause(); }
  }

  /** Gibt true zurück, wenn die Sprachausgabe gestartet ist, false wenn Chrome sie ohne Klick blockiert. */
  function speakBrowser(text) {
    return new Promise((resolve) => {
      if (!synth) return resolve(false);
      const u = new SpeechSynthesisUtterance(text);
      if (deVoice) u.voice = deVoice;
      u.lang = 'de-DE'; u.rate = 1.02; u.pitch = 0.9;
      u.onstart = () => { startedSpeaking(); resolve(true); };
      u.onend = doneSpeaking;
      u.onerror = () => { doneSpeaking(); resolve(false); };
      synth.speak(u);
      setTimeout(() => resolve(!!synth.speaking), 2500);        // weder Start noch Fehler gemeldet
    });
  }

  // Server-Stimme (ElevenLabs); bei jedem Fehler fällt JARVIS auf die Browser-Stimme zurück. Gibt zurück, ob gesprochen wird.
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
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!voiceWarned) { voiceWarned = true; banner.textContent = (err.error || 'Die ElevenLabs-Stimme ist nicht verfügbar.') + ' Ich spreche mit der Browser-Stimme weiter.'; banner.classList.add('show'); }
          throw new Error('speak ' + res.status);
        }
        const blob = await res.blob();
        if (seq !== speakSeq) return true;         // inzwischen wurde etwas anderes angefordert
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const finish = () => { URL.revokeObjectURL(url); if (currentAudio === audio) { currentAudio = null; doneSpeaking(); } };
        audio.onended = finish; audio.onerror = finish;
        currentAudio = audio;
        await audio.play();                        // schlägt fehl, wenn Chrome Ton ohne Klick sperrt
        startedSpeaking();
        return true;
      } catch (e) {
        if (seq !== speakSeq) return true;
        currentAudio = null;
      }
    }
    return speakBrowser(text);
  }

  // ---------- UI ----------
  const STATE = {
    idle: ['Bereit', 'ok'], listening: ['Höre zu …', 'live'], thinking: ['Denke nach …', 'live'], speaking: ['Spreche …', 'live'],
  };
  function setState(mode) {
    window.Orb && window.Orb.setMode(mode);
    const [label, cls] = STATE[mode] || STATE.idle;
    stateText.textContent = label;
    stateDot.className = 'dot ' + cls;
  }

  const hhmm = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  function addBubble(text, who, interim) {
    const m = el('div', 'msg ' + who + (interim ? ' interim' : ''));
    const meta = el('div', 'meta');
    meta.append(el('span', '', who === 'user' ? 'Du' : 'Jarvis'), el('span', '', hhmm(new Date())));
    m.append(meta, el('div', 'bubble', text));
    dialog.appendChild(m);
    if (window.Orb && window.Orb.burst && !interim) window.Orb.burst(who === 'user' ? 5 : 9);
    while (dialog.children.length > 60) dialog.removeChild(dialog.firstChild);
    dialog.scrollTop = dialog.scrollHeight;
    return { node: m.querySelector('.bubble'), remove: () => m.remove(), set textContent(t) { m.querySelector('.bubble').textContent = t; } };
  }
  let typingEl = null;
  function showTyping(on) {
    if (on && !typingEl) {
      typingEl = el('div', 'msg jarvis typing');
      const b = el('div', 'bubble'); b.append(el('i'), el('i'), el('i'));
      typingEl.append(b);
      dialog.appendChild(typingEl); dialog.scrollTop = dialog.scrollHeight;
    } else if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  // Nichts doppelt vorlesen: bereits gesprochene Sätze merkt sich der Browser (auch über neue Chats hinweg).
  const SPOKEN_KEY = 'jarvis.spoken';
  const normSentence = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  function loadSpoken() { try { return JSON.parse(localStorage.getItem(SPOKEN_KEY) || '[]'); } catch (e) { return []; } }
  function saveSpoken(list) { try { localStorage.setItem(SPOKEN_KEY, JSON.stringify(list.slice(-300))); } catch (e) {} }
  function freshSpeech(text) {
    const seen = loadSpoken();
    const set = new Set(seen);
    const out = [];
    for (const sent of text.match(/[^.!?]+[.!?]*/g) || []) {
      const key = normSentence(sent);
      if (key.length < 12) { out.push(sent); continue; }       // kurze Bestätigungen dürfen sich wiederholen
      if (set.has(key)) continue;
      set.add(key); seen.push(key); out.push(sent);
    }
    saveSpoken(seen);
    return out.join(' ').trim();
  }
  // Analyse-Modus: Text vor <<SPRICH>> erscheint formatiert im Chat, nur der Teil danach wird gesprochen.
  const stripMd = (s) => s.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/^\s*[-*]\s+/gm, '').trim();
  function renderRich(node, text) {
    node.textContent = ''; node.classList.add('rich');
    let list = null;
    const inline = (parent, t) => t.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(el('strong', '', part.slice(2, -2))); else if (part) parent.appendChild(document.createTextNode(part));
    });
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      const h = line.match(/^#{1,4}\s+(.*)/), li = line.match(/^\s*[-*]\s+(.*)/);
      if (li) { if (!list) { list = el('ul'); node.appendChild(list); } const i = el('li'); inline(i, li[1]); list.appendChild(i); continue; }
      list = null;
      if (h) node.appendChild(el('h4', '', h[1])); else if (line.trim()) { const p = el('p'); inline(p, line); node.appendChild(p); }
    }
  }
  function jarvisSay(text) {
    const [shown, spokenPart] = String(text).split('<<SPRICH>>');
    const bubble = addBubble(shown.trim(), 'jarvis');
    if (/^#{1,4}\s|^\s*[-*]\s/m.test(shown) && bubble.node) renderRich(bubble.node, shown.trim());
    const t = freshSpeech(stripMd(spokenPart ? spokenPart.trim() : shown));
    if (t) speak(t);
  }

  const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function relTime(iso) {
    const min = Math.round((new Date(iso) - Date.now()) / 60000);
    if (min < 1) return 'jetzt';
    if (min < 60) return 'in ' + min + ' Min';
    if (min < 1440) return 'in ' + Math.round(min / 60) + ' Std';
    return 'in ' + Math.round(min / 1440) + ' T';
  }

  // Uhr und Begrüßung
  function tickClock() {
    const d = new Date();
    clockEl.textContent = '';
    clockEl.append(hhmm(d));
    clockEl.appendChild(el('small', '', d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })));
    const h = d.getHours();
    $('heroTitle').textContent = (h < 5 ? 'Noch wach' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : h < 22 ? 'Guten Abend' : 'Gute Nacht') + ', ' + USER_NAME + '.';
  }
  setInterval(tickClock, 30000);

  function renderState(s) {
    if (!s) return;
    if (s.userName) { USER_NAME = s.userName; ADDRESS = s.address || s.userName; tickClock(); }

    // Agenten
    const al = $('agentList'); al.textContent = '';
    $('agentCount').textContent = (s.agents || []).length;
    (s.agents || []).forEach((a) => {
      const li = el('li', 'task'); const body = el('div');
      body.append(el('div', '', a.name + (a.builtin ? '' : ' · eigen')), el('div', 'sub', a.role));
      li.appendChild(body); al.appendChild(li);
    });
    if (!(s.agents || []).length) al.appendChild(el('li', 'empty', 'Sag: „Erstelle mir einen Agenten, der …“'));

    // Aufgaben
    const tl = $('taskList'); tl.textContent = '';
    $('taskCount').textContent = s.tasks.length;
    if (!s.tasks.length) tl.appendChild(el('li', 'empty', 'Nichts offen. Sag zum Beispiel: „Füge Aufgabe Zahnarzt anrufen hinzu“.'));
    s.tasks.forEach((t) => {
      const li = el('li', 'task');
      const cb = el('button', 'check'); cb.type = 'button'; cb.title = 'Erledigt'; cb.setAttribute('aria-label', 'Als erledigt markieren: ' + t.text);
      cb.appendChild(icon('i-check'));
      cb.addEventListener('click', async () => {
        li.classList.add('done');
        try { renderState((await api('/api/tasks/complete', { method: 'POST', body: JSON.stringify({ id: t.id }) })).state); }
        catch (e) { li.classList.remove('done'); }
      });
      li.append(cb, el('span', 't', t.text));
      if (t.due) li.appendChild(el('span', 'pill', t.due));
      tl.appendChild(li);
    });

    // Erinnerungen
    const rl = $('remList'); rl.textContent = '';
    $('remCount').textContent = s.reminders.length;
    if (!s.reminders.length) rl.appendChild(el('li', 'empty', 'Keine Erinnerungen. Sag: „Erinnere mich morgen um 9 an …“.'));
    s.reminders.forEach((r) => {
      const li = el('li', 'rem');
      const t = el('time', '', new Date(r.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      t.appendChild(el('small', '', relTime(r.at)));
      t.title = fmtTime(r.at);
      li.append(t, el('span', '', r.text));
      rl.appendChild(li);
    });

    // Ziel
    const gb = $('goalBox'); gb.textContent = '';
    if (!s.goal) gb.appendChild(el('div', 'empty', 'Noch kein Ziel. Sag: „Mein Ziel ist …“, dann plane ich mit dir die Schritte.'));
    else {
      const pct = Number.isFinite(s.goal.realisierbarkeit) ? Math.max(0, Math.min(100, s.goal.realisierbarkeit)) : null;
      if (pct != null) {
        const ring = el('div', 'ring');
        const R = 30, C = 2 * Math.PI * R;
        ring.innerHTML = `<svg viewBox="0 0 76 76"><circle class="bg" cx="38" cy="38" r="${R}"/><circle class="fg" cx="38" cy="38" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg>`;
        ring.appendChild(el('b', '', pct + '%'));
        gb.appendChild(ring);
      } else gb.style.gridTemplateColumns = '1fr';
      const info = el('div');
      info.append(el('h3', '', s.goal.text.slice(0, 120)), el('div', 'sub', pct != null ? 'Realisierbarkeit' : 'In Arbeit'));
      gb.appendChild(info);
      if (s.goal.schritte && s.goal.schritte.length) {
        const ol = el('ol', 'steps');
        s.goal.schritte.slice(0, 5).forEach((st) => ol.appendChild(el('li', '', String(st))));
        gb.appendChild(ol);
      }
    }

    // Notizen
    const nl = $('noteList'); nl.textContent = '';
    if (!s.notes || !s.notes.length) nl.appendChild(el('div', 'empty', 'Noch keine Notizen. Sag: „Notiere …“.'));
    (s.notes || []).forEach((n) => { const d = el('div', 'note'); if (n.title) d.appendChild(el('b', '', n.title)); d.appendChild(el('p', '', n.text)); nl.appendChild(d); });
  }

  function renderSystem(h) {
    const box = $('sysBox'); box.textContent = '';
    const item = (label, status) => { const d = el('div'); d.append(el('span', 'dot ' + status), el('span', '', label)); box.appendChild(d); };
    item(h.provider === 'gemini' ? 'KI: Gemini' : 'KI: Claude', h.keyConfigured ? 'ok' : 'bad');
    item(h.voice ? 'Stimme: ElevenLabs' : 'Stimme: Browser', h.voice ? 'ok' : 'warn');
    item(h.obsidian ? 'Obsidian verbunden' : 'Obsidian aus', h.obsidian ? 'ok' : 'warn');
    item(h.tools && h.tools.includes('open_universe') ? 'Obsidian-Graph: Jarvis verbunden' : 'Obsidian-Graph: nicht verbunden', h.tools && h.tools.includes('open_universe') ? 'ok' : 'warn');
    item(h.tools && h.tools.includes('open_website') ? 'Browser öffnen: bereit' : 'Server veraltet – neu starten', h.tools && h.tools.includes('open_website') ? 'ok' : 'bad');
    item(h.briefing ? 'Morgenbriefing: täglich ' + h.briefing : 'Morgenbriefing aus', h.briefing ? 'ok' : 'warn');
    item(h.mailWatch ? 'Mail-Alarm aktiv' : 'Mail-Alarm aus', h.mailWatch ? 'ok' : 'warn');
  }

  // ---------- Gespräch ----------
  async function respond(text) {
    setState('thinking');
    showTyping(true);
    try {
      const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text, offsetMinutes: new Date().getTimezoneOffset() }) });
      showTyping(false);
      renderState(data.state);
      jarvisSay(data.reply);
    } catch (err) {
      showTyping(false);
      if (err.code === 401) { askToken('Bitte Zugangs-Token eingeben.'); setState('idle'); return; }
      const m = addBubble('Das hat nicht geklappt. ' + (err.message || ''), 'jarvis');
      dialog.lastChild.classList.add('error');
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
      if (data.briefing) {
        const text = 'Dein Morgenbriefing: ' + data.briefing.text;
        jarvisSay(text);
        if (window.Notification && Notification.permission === 'granted') { try { new Notification('JARVIS – Morgenbriefing', { body: data.briefing.text.slice(0, 180) }); } catch (e) {} }
      }
      (data.mail || []).forEach((a) => {
        const text = 'Wichtige Mail von ' + a.from + (a.subject ? ': ' + a.subject : '.');
        jarvisSay(text);
        if (window.Notification && Notification.permission === 'granted') { try { new Notification('JARVIS – Mail', { body: text }); } catch (e) {} }
      });
      if (data.fired.length && window.Notification && Notification.permission === 'granted') {
        data.fired.forEach(r => { try { new Notification('JARVIS', { body: r.text }); } catch (e) {} });
      }
    } catch (e) { /* offline oder Token fehlt – nächster Versuch folgt */ }
  }
  setInterval(() => { if (!overlayOpen()) poll(); }, 10000);

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
  let USER_NAME = 'Augustin', ADDRESS = 'Augustin';
  // "Jarvis" erkennen, auch wenn die Spracherkennung es anders schreibt (siehe wake.js)
  const heardEl = document.getElementById('heard');
  let heardTimer = null;
  function showHeard(text, cls) {
    if (!heardEl) return;
    heardEl.textContent = text;
    heardEl.className = 'heard on' + (cls ? ' ' + cls : '');
    clearTimeout(heardTimer);
    heardTimer = setTimeout(() => { heardEl.className = 'heard'; }, 6000);
  }
  // kurzer Ton als Bestätigung des Wake-Words (kein Sprechen, damit das Zuhören nicht unterbrochen wird)
  let actx = null;
  function chime() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [660, 880].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.17);
        o.connect(g); g.connect(actx.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.19);
      });
    } catch (e) { /* ohne Ton: es gibt die visuelle Bestätigung */ }
  }
  let wakeCued = false;          // Wake-Word schon aus dem Zwischenergebnis bestätigt
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
    showHeard('Ich höre: ' + text);
    const m = window.findWake(text);
    if (m) {
      // alles nach dem Wake-Word ist der Befehl
      const cmd = text.slice(m.end).replace(/^[\s,.:!?-]+/, '');
      if (cmd.length > 2) { armedUntil = 0; handleInput(cmd); }
      else { armedUntil = Date.now() + ARM_MS; if (!wakeCued) chime(); showHeard('Ja? Sag deinen Befehl …', 'wake'); setState('listening'); }
      wakeCued = false;
      return;
    }
    if (Date.now() < armedUntil) { armedUntil = 0; handleInput(text); }
    // sonst: Gespräch im Raum ignorieren
  }

  function initRecognition() {
    if (!SR) { unsupported.classList.add('show'); return; }
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
      if (interim) {
        showHeard('Ich höre: ' + interim);
        // Wake-Word schon im Zwischenergebnis: sofort bestätigen und auf den Befehl vorbereiten
        if (window.findWake(interim) && !wakeCued && Date.now() >= armedUntil) { wakeCued = true; armedUntil = Date.now() + ARM_MS; chime(); showHeard('Ja? Sag deinen Befehl …', 'wake'); }
        if (Date.now() < armedUntil || window.findWake(interim)) {
          if (!interimBubble) interimBubble = addBubble(interim, 'user', true);
          else interimBubble.textContent = interim;
        }
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
      else if (e.error === 'network') showHeard('Die Spracherkennung braucht Internet (Chrome schickt das Audio zur Auswertung an Google).', 'warn');
      else if (e.error === 'audio-capture') showHeard('Kein Mikrofon gefunden.', 'warn');
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
    if (overlayOpen()) return;
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
  composer.addEventListener('submit', (e) => { e.preventDefault(); stopSpeaking(); handleInput(textInput.value); textInput.value = ''; });
  $('suggest').addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) { stopSpeaking(); handleInput(b.dataset.q); } });
  $('unsupportedOk').addEventListener('click', () => unsupported.classList.remove('show'));

  initRecognition();
  setState('idle');
  tickClock();

  // ---------- Start ----------
  // Beim Öffnen sagt JARVIS sofort die Anrede ("Hey Boss") und hört gleich zu; ein erster Befehl braucht kein "Hey Jarvis".
  // Chrome kann Ton ohne Klick sperren: dann gibt es einen Hinweis, und die Begrüßung folgt beim ersten Klick. Das Hören startet trotzdem.
  let pendingGreet = false;
  const greetText = () => `${ADDRESS}.`;

  async function openGreeting() {
    armAfterSpeech = true;
    armedUntil = Date.now() + ARM_MS + 3000;
    if (recognition && !listening) startListening();
    addBubble(greetText(), 'jarvis');
    const spoke = await speak(greetText());
    if (!spoke) {
      pendingGreet = true;
      addBubble('Chrome erlaubt mir ohne Klick noch keinen Ton. Klick einmal irgendwo. Dauerhaft: Schloss-Symbol in der Adresszeile → Website-Einstellungen → Ton → Zulassen.', 'jarvis');
    }
  }

  function onFirstGesture(ev) {
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    // Klick auf Mikro/Orb startet das Hören selbst
    if (ev && ev.target && (ev.target === micBtn || micBtn.contains(ev.target) || ev.target === orbCanvas)) return;
    if (pendingGreet) { pendingGreet = false; armAfterSpeech = true; if (recognition && !listening) startListening(); speak(greetText()); }
    else if (recognition && !listening) startListening();     // das automatische Hören ging nicht (z. B. Mikrofon noch nicht erlaubt)
  }

  async function boot(afterToken) {
    let health;
    try { health = await api('/api/health'); } catch (e) { addBubble('Server nicht erreichbar.', 'jarvis'); return; }
    voiceOn = !!health.voice;
    renderSystem(health);
    if (!health.keyConfigured) { banner.textContent = 'Auf dem Server fehlt der KI-Key (' + (health.provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY') + '). Ohne ihn kann ich nicht antworten.'; banner.classList.add('show'); }
    try {
      renderState(await api('/api/state'));
      apiOverlay.classList.remove('show');
    } catch (e) {
      if (e.code === 401) { askToken(TOKEN ? 'Token ist falsch.' : ''); return; }
    }
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    openGreeting();
  }
  boot(false);
})();
