/* JARVIS — Sprachlogik: Web Speech API (Erkennung + Ausgabe),
   Mikrofon-Pegel für den Orb, einfache Ziel-Erkennung & Dialog. */
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
  const state = { goal: null };

  function parseAmount(text) {
    // findet z.B. "500€", "500 euro", "1.500", "1500 eur"
    const m = text.replace(/\./g, '').match(/(\d[\d\s]*)\s*(€|euro|eur)?/i);
    if (m && /€|euro|eur/i.test(text)) {
      const n = parseInt(m[1].replace(/\s/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    return null;
  }

  function setGoal(amount, raw) {
    state.goal = { amount, raw };
    goalText.innerHTML = amount
      ? `JARVIS soll <span class="goal-amount">${amount.toLocaleString('de-DE')} €</span> verdienen`
      : raw;
    goalPanel.classList.add('show');
  }

  function planFor(amount) {
    // Einfacher, generischer "Strategie"-Plan als Demo
    const ideen = [
      `Freelance-Aufträge (Texte, Design, Code) über Plattformen — ca. ${Math.ceil(amount / 50)} kleine Jobs à 50 €.`,
      `Digitales Produkt einmal erstellen und mehrfach verkaufen — Vorlage, E-Book oder Kurs.`,
      `Bestehende Gegenstände verkaufen und den Erlös reinvestieren.`,
      `Ein Micro-Angebot definieren und gezielt 5 potenzielle Kunden ansprechen.`,
    ];
    return ideen;
  }

  function respond(text) {
    setState('thinking');
    const lower = text.toLowerCase();
    const amount = parseAmount(text);

    setTimeout(() => {
      // Begrüßung
      if (/^(hallo|hey|hi|jarvis|guten (tag|morgen|abend))\b/.test(lower) && !amount) {
        jarvisSay('Guten Tag. Ich bin JARVIS. Nenne mir dein Ziel — zum Beispiel, wie viel Geld ich für dich verdienen soll.');
        return;
      }
      // Ziel mit Betrag
      if (amount || /verdien|geld|ziel|einnahm|umsatz/.test(lower)) {
        if (amount) {
          setGoal(amount, text);
          const ideen = planFor(amount);
          jarvisSay(
            `Verstanden. Ziel gesetzt: ${amount.toLocaleString('de-DE')} Euro. ` +
            `Mein Vorschlag, um das zu erreichen: Erstens, ${ideen[0]} Zweitens, ${ideen[1]} ` +
            `Sag "Plan zeigen", wenn du alle Schritte sehen möchtest.`
          );
        } else {
          jarvisSay('Wie hoch soll das Ziel sein? Nenne mir einen Betrag, zum Beispiel 500 Euro.');
        }
        return;
      }
      // Plan zeigen
      if (/plan|schritte|zeig/.test(lower) && state.goal && state.goal.amount) {
        const ideen = planFor(state.goal.amount);
        addBubble('Plan für ' + state.goal.amount.toLocaleString('de-DE') + ' €:\n• ' + ideen.join('\n• '), 'jarvis');
        speak('Hier ist der vollständige Plan. Insgesamt ' + ideen.length + ' Schritte, um dein Ziel zu erreichen.');
        return;
      }
      // Status
      if (/status|wie weit|fortschritt/.test(lower)) {
        jarvisSay(state.goal
          ? `Aktuelles Ziel: ${state.goal.amount ? state.goal.amount.toLocaleString('de-DE') + ' Euro' : state.goal.raw}. Bereit, den Plan umzusetzen.`
          : 'Es ist noch kein Ziel gesetzt. Nenne mir eines.');
        return;
      }
      // Danke / Ende
      if (/danke|stop|ende|tschüss/.test(lower)) {
        jarvisSay('Immer zu Diensten. Ich bin bereit, wenn du mich brauchst.');
        return;
      }
      // Fallback: als Ziel übernehmen
      setGoal(null, text);
      jarvisSay(`Ich habe dein Ziel notiert: "${text}". Soll ich dafür einen Plan erstellen?`);
    }, 550);
  }

  function handleInput(text) {
    text = text.trim();
    if (!text) return;
    addBubble(text, 'user');
    respond(text);
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
