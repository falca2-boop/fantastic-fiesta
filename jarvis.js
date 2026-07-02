/* JARVIS — Sprachlogik mit direkter Claude-API-Integration im Browser.
   API Key wird einmalig eingegeben und in localStorage gespeichert. */
(function () {
  const micBtn = document.getElementById('micBtn');
  const textInput = document.getElementById('textInput');
  const dialog = document.getElementById('dialog');
  const stateLabel = document.getElementById('stateLabel');
  const goalPanel = document.getElementById('goalPanel');
  const goalText = document.getElementById('goalText');
  const unsupported = document.getElementById('unsupported');
  const orbCanvas = document.getElementById('orb');
  const apiOverlay = document.getElementById('apiOverlay');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiSaveBtn = document.getElementById('apiSaveBtn');
  const apiSkipBtn = document.getElementById('apiSkipBtn');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null;
  let listening = false;
  let interimBubble = null;
  let deVoice = null;
  let ANTHROPIC_KEY = localStorage.getItem('jarvis_api_key') || '';

  // ---------- API Key Setup ----------
  function initApiOverlay() {
    if (ANTHROPIC_KEY) { apiOverlay.style.display = 'none'; return; }
    apiOverlay.style.display = 'flex';
    apiSaveBtn.addEventListener('click', () => {
      const k = apiKeyInput.value.trim();
      if (!k.startsWith('sk-')) { apiKeyInput.style.borderColor = '#ff5c7a'; return; }
      ANTHROPIC_KEY = k;
      localStorage.setItem('jarvis_api_key', k);
      apiOverlay.style.display = 'none';
      greetOnce();
    });
    apiSkipBtn.addEventListener('click', () => {
      apiOverlay.style.display = 'none';
      greetOnce();
    });
    apiKeyInput.addEventListener('keydown', e => { if (e.key === 'Enter') apiSaveBtn.click(); });
  }

  // ---------- Sprachausgabe ----------
  function pickVoice() {
    const voices = synth.getVoices();
    deVoice = voices.find(v => /de(-|_)?/i.test(v.lang) && /google|microsoft/i.test(v.name))
           || voices.find(v => /de(-|_)?/i.test(v.lang))
           || voices[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  function speak(text) {
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (deVoice) u.voice = deVoice;
    u.lang = 'de-DE'; u.rate = 1.02; u.pitch = 0.9;
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
    while (dialog.children.length > 10) dialog.removeChild(dialog.firstChild);
    return b;
  }

  function jarvisSay(text) { addBubble(text, 'jarvis'); speak(text); }

  // ---------- Ziel-Panel ----------
  const state = { goal: null };

  function setGoal(displayHtml, raw, schritte, realisierbarkeit) {
    state.goal = { displayHtml, raw, schritte: schritte || [], realisierbarkeit };
    let html = displayHtml;
    if (realisierbarkeit != null) {
      html += ` <span style="font-size:11px;color:#6f8aa0;letter-spacing:2px"> · ${realisierbarkeit}% realisierbar</span>`;
    }
    goalText.innerHTML = html;
    goalPanel.classList.add('show');
  }

  // ---------- Claude direkt ----------
  async function askClaude(userMessage) {
    if (!ANTHROPIC_KEY) return null;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Du bist JARVIS, ein intelligenter KI-Assistent im Stil von Iron Man. Du antwortest kurz, präzise und auf Deutsch.
Wenn der Nutzer ein Ziel nennt (z.B. Geld verdienen, etwas erreichen), antworte NUR mit diesem JSON (kein weiterer Text):
{
  "typ": "ziel",
  "analyse": "Kurze Analyse des Ziels (1-2 Sätze)",
  "schritte": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "realisierbarkeit": 85,
  "antwort": "Kurze gesprochene Antwort (1-2 Sätze, direkt und motivierend)"
}
Bei normalen Fragen oder Gesprächen antworte mit:
{
  "typ": "chat",
  "antwort": "Deine Antwort hier"
}`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('jarvis_api_key');
        ANTHROPIC_KEY = '';
        throw new Error('invalid_key');
      }
      throw new Error('api_error_' + res.status);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    try { return JSON.parse(text); }
    catch { return { typ: 'chat', antwort: text }; }
  }

  // ---------- Lokaler Demo-Modus Fallback ----------
  function localRespond(text) {
    const lower = text.toLowerCase();
    const amountMatch = text.replace(/\./g, '').match(/(\d[\d\s]*)\s*(€|euro|eur)/i);
    const amount = amountMatch ? parseInt(amountMatch[1].replace(/\s/g, ''), 10) : null;

    if (/^(hallo|hey|hi|jarvis|guten)/.test(lower)) {
      return { typ: 'chat', antwort: 'Guten Tag. Ich bin JARVIS im Demo-Modus. Füge einen API Key hinzu für echte KI-Antworten.' };
    }
    if (amount) {
      return {
        typ: 'ziel',
        analyse: `${amount.toLocaleString('de-DE')} € ist ein erreichbares Ziel mit der richtigen Strategie.`,
        schritte: [
          `Freelance-Aufträge über Plattformen — ca. ${Math.ceil(amount / 50)} Aufträge à 50 €`,
          'Digitales Produkt erstellen und mehrfach verkaufen (E-Book, Vorlage, Kurs)',
          'Micro-Angebot definieren und 5 potenzielle Kunden direkt ansprechen',
        ],
        realisierbarkeit: 78,
        antwort: `Ziel gesetzt: ${amount.toLocaleString('de-DE')} Euro. Ich habe 3 Schritte vorbereitet. Sage "Plan zeigen" für Details.`,
      };
    }
    return {
      typ: 'ziel',
      analyse: 'Ziel aufgenommen.',
      schritte: ['Ziel konkretisieren', 'Ersten Schritt heute umsetzen', 'Fortschritt täglich messen'],
      realisierbarkeit: 80,
      antwort: `Ich habe dein Ziel notiert. Sage "Plan zeigen" für die nächsten Schritte.`,
    };
  }

  // ---------- Hauptlogik ----------
  async function respond(text) {
    setState('thinking');
    const lower = text.toLowerCase();

    // Lokale Schnellbefehle
    if (/^(hallo|hey|hi|jarvis|guten)\b/.test(lower) && !/\d/.test(text) && !ANTHROPIC_KEY) {
      jarvisSay('Guten Tag. Ich bin JARVIS. Nenne mir dein Ziel.');
      return;
    }
    if (/^(plan|schritte|zeig)/.test(lower) && state.goal?.schritte?.length) {
      const list = state.goal.schritte.map((s, i) => `${i + 1}. ${s}`).join('\n');
      addBubble('Plan:\n' + list, 'jarvis');
      speak('Hier sind deine Schritte: ' + state.goal.schritte.join('. '));
      return;
    }
    if (/^(status|wie weit|fortschritt)/.test(lower)) {
      jarvisSay(state.goal ? `Aktuelles Ziel: ${state.goal.raw}.` : 'Kein Ziel gesetzt. Nenne mir eines.');
      return;
    }
    if (/^(danke|stop|ende|tschüss)/.test(lower)) {
      jarvisSay('Immer zu Diensten. Ich stehe bereit.');
      return;
    }

    // Claude oder Demo
    let result;
    try {
      result = ANTHROPIC_KEY ? await askClaude(text) : localRespond(text);
    } catch (err) {
      if (err.message === 'invalid_key') {
        jarvisSay('Der API Key ist ungültig. Bitte lade die Seite neu und gib einen gültigen Key ein.');
      } else {
        jarvisSay('Verbindungsfehler. Bitte versuche es erneut.');
      }
      setState('idle');
      return;
    }

    if (!result) { jarvisSay('Kein API Key vorhanden. Lade die Seite neu, um einen einzugeben.'); return; }

    if (result.typ === 'ziel') {
      const amountMatch = text.replace(/\./g, '').match(/(\d[\d\s]*)\s*(€|euro|eur)/i);
      const amount = amountMatch ? parseInt(amountMatch[1].replace(/\s/g, ''), 10) : null;
      const displayHtml = amount
        ? `Ziel: <span class="goal-amount">${amount.toLocaleString('de-DE')} €</span>`
        : `Ziel: <strong style="color:#eafaff">${text.slice(0, 60)}</strong>`;
      setGoal(displayHtml, text, result.schritte, result.realisierbarkeit);
      if (result.analyse) addBubble('Analyse: ' + result.analyse, 'jarvis');
      jarvisSay(result.antwort);
    } else {
      jarvisSay(result.antwort);
    }
  }

  function handleInput(text) {
    text = text.trim();
    if (!text) return;
    addBubble(text, 'user');
    respond(text);
  }

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
    if (apiOverlay.style.display !== 'none') return;
    if (!recognition) { textInput.focus(); return; }
    if (listening) { recognition.stop(); return; }
    synth && synth.cancel();
    listening = true;
    micBtn.classList.add('active');
    setState('listening');
    startMicMeter();
    try { recognition.start(); } catch (e) {}
  }

  micBtn.addEventListener('click', toggleListen);
  orbCanvas.addEventListener('click', toggleListen);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { handleInput(textInput.value); textInput.value = ''; }
  });

  initRecognition();
  setState('idle');

  let greeted = false;
  function greetOnce() {
    if (greeted) return; greeted = true;
    const mode = ANTHROPIC_KEY ? 'KI-Modus aktiv' : 'Demo-Modus';
    jarvisSay(`Systeme online. ${mode}. Ich bin JARVIS. Wie kann ich dir heute helfen?`);
  }

  initApiOverlay();
  if (ANTHROPIC_KEY) {
    window.addEventListener('pointerdown', greetOnce, { once: true });
  }
})();
