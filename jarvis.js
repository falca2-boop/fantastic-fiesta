/* JARVIS — Sprachlogik: Web Speech API (Erkennung + Ausgabe),
   Mikrofon-Pegel für den Orb, Ziel-Erkennung & Dialog via n8n/Claude. */
(function () {
  const micBtn = document.getElementById('micBtn');
  const textInput = document.getElementById('textInput');
  const dialog = document.getElementById('dialog');
  const stateLabel = document.getElementById('stateLabel');
  const goalPanel = document.getElementById('goalPanel');
  const goalText = document.getElementById('goalText');
  const unsupported = document.getElementById('unsupported');
  const orbCanvas = document.getElementById('orb');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null;
  let listening = false;
  let interimBubble = null;
  let deVoice = null;

  // ---------- Sprachausgabe ----------
  function pickVoice() {
    const voices = synth.getVoices();
    deVoice = voices.find(v => /de(-|_)?/i.test(v.lang) && /google|microsoft/i.test(v.name))
           || voices.find(v => /de(-|_)?/i.test(v.lang))
           || voices[0] || null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (deVoice) u.voice = deVoice;
    u.lang = 'de-DE';
    u.rate = 1.02; u.pitch = 0.9;
    u.onstart = () => setState('speaking');
    u.onend = () => setState(listening ? 'listening' : 'idle');
    synth.speak(u);
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
    while (dialog.children.length > 8) dialog.removeChild(dialog.firstChild);
    return b;
  }

  function jarvisSay(text) {
    addBubble(text, 'jarvis');
    speak(text);
  }

  // ---------- Ziel- & Dialoglogik ----------
  const N8N_WEBHOOK = 'https://falca.app.n8n.cloud/webhook/orb-goal';

  const state = { goal: null, plan: null };

  function parseAmount(text) {
    const m = text.replace(/\./g, '').match(/(\d[\d\s]*)\s*(€|euro|eur)?/i);
    if (m && /€|euro|eur/i.test(text)) {
      const n = parseInt(m[1].replace(/\s/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    return null;
  }

  function setGoal(goalText_display, raw, schritte, realisierbarkeit) {
    state.goal = { display: goalText_display, raw, schritte: schritte || [], realisierbarkeit };
    goalText.innerHTML = goalText_display;
    if (realisierbarkeit != null) {
      goalText.innerHTML += ` <span style="font-size:12px;color:#6f8aa0;letter-spacing:2px"> · ${realisierbarkeit}% realisierbar</span>`;
    }
    goalPanel.classList.add('show');
  }

  async function callN8N(goalText) {
    const resp = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goalText }),
    });
    if (!resp.ok) throw new Error('n8n ' + resp.status);
    return resp.json();
  }

  async function respond(text) {
    setState('thinking');
    const lower = text.toLowerCase();

    // Begrüßung — lokal, kein API-Call nötig
    if (/^(hallo|hey|hi|jarvis|guten (tag|morgen|abend))\b/.test(lower) && !/\d/.test(text)) {
      jarvisSay('Guten Tag. Ich bin JARVIS. Nenne mir dein Ziel — zum Beispiel: Ich möchte 500 Euro verdienen.');
      return;
    }

    // Plan zeigen (bereits gesetzt)
    if (/plan|schritte|zeig/.test(lower) && state.goal && state.goal.schritte.length) {
      const list = state.goal.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n');
      addBubble('Plan:\n' + list, 'jarvis');
      speak('Hier sind die Schritte: ' + state.goal.schritte.join('. '));
      return;
    }

    // Status lokal
    if (/^(status|wie weit|fortschritt)\b/.test(lower)) {
      jarvisSay(state.goal
        ? `Aktuelles Ziel: ${state.goal.raw}. ${state.goal.realisierbarkeit != null ? state.goal.realisierbarkeit + ' Prozent Realisierbarkeit.' : ''}`
        : 'Es ist noch kein Ziel gesetzt. Nenne mir eines.');
      return;
    }

    // Danke / Ende — lokal
    if (/^(danke|stop|ende|tschüss)/.test(lower)) {
      jarvisSay('Immer zu Diensten. Ich bin bereit, wenn du mich brauchst.');
      return;
    }

    // Alles andere → n8n / Claude analysieren lassen
    try {
      const data = await callN8N(text);
      // data: { goal, analyse, schritte, realisierbarkeit, antwort }
      const amount = parseAmount(text);
      const displayHtml = amount
        ? `JARVIS-Ziel: <span class="goal-amount">${amount.toLocaleString('de-DE')} €</span>`
        : `Ziel: <strong style="color:#eafaff">${text}</strong>`;

      setGoal(displayHtml, text, data.schritte, data.realisierbarkeit);

      // Dialog: Analyse als Bubble, dann Antwort sprechen
      if (data.analyse) addBubble('Analyse: ' + data.analyse, 'jarvis');
      jarvisSay(data.antwort || 'Ziel aufgenommen. Sage "Plan zeigen" für die Schritte.');
    } catch (err) {
      console.warn('n8n Fehler', err);
      jarvisSay('Ich konnte das Ziel gerade nicht analysieren. Bitte versuche es erneut.');
    }
  }

  function handleInput(text) {
    text = text.trim();
    if (!text) return;
    addBubble(text, 'user');
    respond(text); // async, Fehler intern behandelt
  }

  // ---------- Mikrofon-Pegel → Orb ----------
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
        const level = (sum / micData.length) / 128;
        window.Orb && window.Orb.setAudioLevel(level);
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) { /* Mikro-Pegel optional */ }
  }
  function stopMicMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    window.Orb && window.Orb.setAudioLevel(0);
  }

  // ---------- Spracherkennung ----------
  function initRecognition() {
    if (!SR) { unsupported.style.display = 'flex'; return; }
    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) {
        if (!interimBubble) interimBubble = addBubble(interim, 'user', true);
        else interimBubble.textContent = interim;
      }
      if (final) {
        if (interimBubble) { interimBubble.remove(); interimBubble = null; }
        handleInput(final);
      }
    };
    recognition.onend = () => {
      if (interimBubble) { interimBubble.remove(); interimBubble = null; }
      listening = false;
      micBtn.classList.remove('active');
      stopMicMeter();
      if (window.Orb.getMode() !== 'speaking') setState('idle');
    };
    recognition.onerror = () => { listening = false; micBtn.classList.remove('active'); stopMicMeter(); setState('idle'); };
  }

  function toggleListen() {
    if (!recognition) { textInput.focus(); return; }
    if (listening) { recognition.stop(); return; }
    synth && synth.cancel();
    listening = true;
    micBtn.classList.add('active');
    setState('listening');
    startMicMeter();
    try { recognition.start(); } catch (e) {}
  }

  // ---------- Events ----------
  micBtn.addEventListener('click', toggleListen);
  orbCanvas.addEventListener('click', toggleListen);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { handleInput(textInput.value); textInput.value = ''; }
  });

  initRecognition();
  setState('idle');

  // Begrüßung nach erster Nutzer-Interaktion (Autoplay-Policy)
  let greeted = false;
  function greetOnce() {
    if (greeted) return; greeted = true;
    jarvisSay('Systeme online. Ich bin JARVIS. Wie kann ich dir heute helfen?');
  }
  window.addEventListener('pointerdown', greetOnce, { once: true });
})();
