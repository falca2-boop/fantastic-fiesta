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
  const elevenKeyInput = document.getElementById('elevenKeyInput');
  const apiSaveBtn = document.getElementById('apiSaveBtn');
  const apiSkipBtn = document.getElementById('apiSkipBtn');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let recognition = null;
  let listening = false;
  let interimBubble = null;
  let deVoice = null;
  // Key aus config.js (lokal, nicht auf GitHub) oder localStorage
  let ANTHROPIC_KEY = (window.JARVIS_CONFIG && window.JARVIS_CONFIG.anthropicKey)
    || localStorage.getItem('jarvis_api_key') || '';
  let ELEVEN_KEY = (window.JARVIS_CONFIG && window.JARVIS_CONFIG.elevenKey)
    || localStorage.getItem('jarvis_eleven_key') || '';
  // ElevenLabs Voice ID: "Adam" — tief, männlich, Englisch/Deutsch
  const ELEVEN_VOICE = 'pNInz6obpgDQGcFmaJgB';

  // n8n-Webhook: JARVIS führt echte Aktionen aus (KI-Analyse + Lead-Generierung
  // über OpenStreetMap). Standardpfad; überschreibbar via config.js.
  const N8N_WEBHOOK = (window.JARVIS_CONFIG && window.JARVIS_CONFIG.n8nWebhook)
    || 'https://falca.app.n8n.cloud/webhook/orb-goal';

  // ---------- API Key Setup ----------
  function initApiOverlay() {
    if (ANTHROPIC_KEY) { apiOverlay.style.display = 'none'; return; }
    apiOverlay.style.display = 'flex';
    apiSaveBtn.addEventListener('click', () => {
      const k = apiKeyInput.value.trim();
      if (!k.startsWith('sk-')) { apiKeyInput.style.borderColor = '#ff5c7a'; return; }
      ANTHROPIC_KEY = k;
      localStorage.setItem('jarvis_api_key', k);
      const ek = elevenKeyInput ? elevenKeyInput.value.trim() : '';
      if (ek) { ELEVEN_KEY = ek; localStorage.setItem('jarvis_eleven_key', ek); }
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

  async function speakElevenLabs(text) {
    setState('speaking');
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.3, use_speaker_boost: true },
        }),
      });
      if (!res.ok) throw new Error('eleven_' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setState(listening ? 'listening' : 'idle'); };
      audio.onerror = () => { setState(listening ? 'listening' : 'idle'); };
      await audio.play();
    } catch (e) {
      console.warn('ElevenLabs Fehler, Fallback auf Browser-Stimme:', e);
      speakBrowser(text);
    }
  }

  function speakBrowser(text) {
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (deVoice) u.voice = deVoice;
    u.lang = 'de-DE'; u.rate = 1.02; u.pitch = 0.9;
    u.onstart = () => setState('speaking');
    u.onend = () => setState(listening ? 'listening' : 'idle');
    synth.speak(u);
  }

  function speak(text) {
    if (ELEVEN_KEY) { speakElevenLabs(text); } else { speakBrowser(text); }
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

  // ---------- Leads-Darstellung (echte Kontakte aus n8n) ----------
  function renderLeads(leads, ort, branche) {
    const b = document.createElement('div');
    b.className = 'bubble jarvis leads-bubble';
    const head = document.createElement('div');
    head.className = 'leads-head';
    head.textContent = `${leads.length} Leads gefunden` +
      (branche ? ` · ${branche}` : '') + (ort ? ` · ${ort}` : '');
    b.appendChild(head);

    leads.forEach(l => {
      const row = document.createElement('div');
      row.className = 'lead-row';
      const name = document.createElement('div');
      name.className = 'lead-name';
      name.textContent = l.name;
      row.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'lead-meta';
      const parts = [];
      if (l.adresse) parts.push(l.adresse);
      if (l.telefon) parts.push('☎ ' + l.telefon);
      if (l.email) parts.push('✉ ' + l.email);
      meta.textContent = parts.join('  ·  ');
      row.appendChild(meta);

      if (l.website) {
        const a = document.createElement('a');
        a.className = 'lead-link';
        a.href = l.website; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = l.website.replace(/^https?:\/\//, '');
        row.appendChild(a);
      }
      b.appendChild(row);
    });

    dialog.appendChild(b);
    while (dialog.children.length > 10) dialog.removeChild(dialog.firstChild);
    return b;
  }

  // ---------- JARVIS via n8n (echte Aktionen) ----------
  async function askN8n(text) {
    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: text }),
    });
    if (!res.ok) throw new Error('n8n_' + res.status);
    const d = await res.json();
    return {
      typ: 'ziel',
      analyse: d.analyse,
      schritte: d.schritte || [],
      realisierbarkeit: d.realisierbarkeit,
      antwort: d.antwort || 'Ziel verarbeitet.',
      leads: d.leads || [],
      lead_ort: d.lead_ort,
      lead_branche: d.lead_branche,
    };
  }

  // ---------- Ziel-Panel & Gedächtnis ----------
  const state = { goal: null, history: [] };

  function pushHistory(role, content) {
    state.history.push({ role, content });
    if (state.history.length > 20) state.history.splice(0, state.history.length - 20);
  }

  function setGoal(displayHtml, raw, schritte, realisierbarkeit) {
    state.goal = { displayHtml, raw, schritte: schritte || [], realisierbarkeit };
    let html = displayHtml;
    if (realisierbarkeit != null) {
      html += ` <span style="font-size:11px;color:#6f8aa0;letter-spacing:2px"> · ${realisierbarkeit}% realisierbar</span>`;
    }
    goalText.innerHTML = html;
    goalPanel.classList.add('show');
  }

  // ---------- Thinking-Bubble ----------
  function addThinkingBubble() {
    const b = document.createElement('div');
    b.className = 'bubble thinking-bubble';
    b.innerHTML = `<div class="think-header">
      <span class="think-dot"></span><span class="think-dot"></span><span class="think-dot"></span>
      <span>Gehirn denkt…</span>
    </div><div class="think-text"></div>`;
    b.addEventListener('click', () => b.classList.toggle('expanded'));
    dialog.appendChild(b);
    while (dialog.children.length > 12) dialog.removeChild(dialog.firstChild);
    return b;
  }

  function finalizeThinkingBubble(bubble, thoughts) {
    if (!thoughts) { bubble.remove(); return; }
    const textEl = bubble.querySelector('.think-text');
    const header = bubble.querySelector('.think-header span:last-child');
    header.textContent = 'Gedanken (klicken zum Aufklappen)';
    textEl.textContent = thoughts.slice(0, 600) + (thoughts.length > 600 ? '…' : '');
    bubble.querySelector('.think-dot').style.animation = 'none';
    bubble.querySelectorAll('.think-dot').forEach(d => d.style.animation = 'none');
  }

  // ---------- Claude direkt (mit Extended Thinking + History) ----------
  async function askClaude(userMessage) {
    if (!ANTHROPIC_KEY) return null;

    // History aufbauen: alle bisherigen Turns + aktuelle Nachricht
    const messages = [...state.history, { role: 'user', content: userMessage }];

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
        max_tokens: 6000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: `Du bist JARVIS, ein hochintelligenter KI-Assistent im Stil von Iron Man. Du denkst wie ein Gehirn: du erinnerst dich an frühere Aussagen im Gespräch, ziehst Schlüsse aus dem Kontext, und gibst präzise, kontextbewusste Antworten auf Deutsch.

Wenn du auf frühere Informationen aus dem Gespräch zurückgreifst, weise aktiv darauf hin (z.B. "Du hast vorhin erwähnt…").

Wenn der Nutzer ein Ziel nennt (z.B. Geld verdienen, etwas erreichen), antworte NUR mit diesem JSON (kein weiterer Text):
{
  "typ": "ziel",
  "analyse": "Kurze Analyse des Ziels (1-2 Sätze, berücksichtige den bisherigen Gesprächskontext)",
  "schritte": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "realisierbarkeit": 85,
  "antwort": "Kurze gesprochene Antwort (1-2 Sätze, direkt und motivierend)"
}
Bei normalen Fragen oder Gesprächen antworte mit:
{
  "typ": "chat",
  "antwort": "Deine Antwort hier (berücksichtige den bisherigen Gesprächskontext)"
}`,
        messages,
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

    // Thinking-Block und Text-Block aus der Response extrahieren
    let thinkingText = null;
    let answerText = '';
    for (const block of data.content || []) {
      if (block.type === 'thinking') thinkingText = block.thinking;
      if (block.type === 'text') answerText += block.text;
    }

    let parsed;
    try { parsed = JSON.parse(answerText); }
    catch { parsed = { typ: 'chat', antwort: answerText }; }
    parsed._thinking = thinkingText;
    return parsed;
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

    // n8n (echte Aktionen) → Claude (mit Thinking + History) → Demo
    let result;
    let thinkBubble = null;
    try {
      try {
        result = await askN8n(text);
      } catch (n8nErr) {
        if (ANTHROPIC_KEY) {
          thinkBubble = addThinkingBubble();
          result = await askClaude(text);
        } else {
          result = localRespond(text);
        }
      }
    } catch (err) {
      if (thinkBubble) thinkBubble.remove();
      if (err.message === 'invalid_key') {
        jarvisSay('Der API Key ist ungültig. Bitte lade die Seite neu und gib einen gültigen Key ein.');
      } else {
        jarvisSay('Verbindungsfehler. Bitte versuche es erneut.');
      }
      setState('idle');
      return;
    }

    if (!result) { jarvisSay('Kein API Key vorhanden. Lade die Seite neu, um einen einzugeben.'); return; }

    // Thinking-Bubble finalisieren
    if (thinkBubble) finalizeThinkingBubble(thinkBubble, result._thinking || null);

    if (result.typ === 'ziel') {
      const amountMatch = text.replace(/\./g, '').match(/(\d[\d\s]*)\s*(€|euro|eur)/i);
      const amount = amountMatch ? parseInt(amountMatch[1].replace(/\s/g, ''), 10) : null;
      const displayHtml = amount
        ? `Ziel: <span class="goal-amount">${amount.toLocaleString('de-DE')} €</span>`
        : `Ziel: <strong style="color:#eafaff">${text.slice(0, 60)}</strong>`;
      setGoal(displayHtml, text, result.schritte, result.realisierbarkeit);
      if (result.analyse) addBubble('Analyse: ' + result.analyse, 'jarvis');
      if (result.leads && result.leads.length) {
        renderLeads(result.leads, result.lead_ort, result.lead_branche);
      }
      jarvisSay(result.antwort);

      // Echte Aktion in n8n auslösen
      triggerN8NAction({ goal: text, amount: amount || 0, schritte: result.schritte, realisierbarkeit: result.realisierbarkeit });
    } else {
      jarvisSay(result.antwort);
    }

    // Antwort ins Gedächtnis speichern
    pushHistory('assistant', result.antwort);
  }

  async function triggerN8NAction(payload) {
    try {
      const res = await fetch('https://falca.app.n8n.cloud/webhook/jarvis-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.message) {
          setTimeout(() => addBubble('✓ ' + data.message, 'jarvis'), 800);
        }
      }
    } catch (e) {
      // n8n nicht erreichbar — kein Fehler zeigen, JARVIS läuft weiter
    }
  }

  function handleInput(text) {
    text = text.trim();
    if (!text) return;
    addBubble(text, 'user');
    pushHistory('user', text);
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

  // ---------- Spracherkennung (Wake-Word + kontinuierlich) ----------
  const WAKE_WORDS = /\b(hey\s+jarvis|jarvis)\b/i;
  let wakeMode = true;   // true = warte auf Wake-Word, false = höre Befehl ab
  let commandTimeout = null;

  function initRecognition() {
    if (!SR) { unsupported.style.display = 'flex'; return; }
    recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.interimResults = true;
    recognition.continuous = true;   // läuft dauerhaft

    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }

      if (wakeMode) {
        // Im Schlafmodus nur auf Wake-Word prüfen
        const combined = (interim + ' ' + final).trim();
        if (WAKE_WORDS.test(combined)) {
          if (interimBubble) { interimBubble.remove(); interimBubble = null; }
          activateByWakeWord();
        }
      } else {
        // Aktiv-Modus: normales Gespräch
        if (interim) {
          if (!interimBubble) interimBubble = addBubble(interim, 'user', true);
          else interimBubble.textContent = interim;
        }
        if (final) {
          if (interimBubble) { interimBubble.remove(); interimBubble = null; }
          clearTimeout(commandTimeout);
          // Wake-Word aus dem Befehl herausschneiden
          const command = final.replace(WAKE_WORDS, '').trim();
          if (command) handleInput(command);
          // Nach 8 Sekunden Stille zurück in den Schlafmodus
          commandTimeout = setTimeout(() => { wakeMode = true; setState('idle'); }, 8000);
        }
      }
    };

    recognition.onend = () => {
      // Automatisch neu starten — Mikrofon bleibt immer an
      if (listening) {
        try { recognition.start(); } catch (e) {}
      }
    };
    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return; // ignorieren, normal
      if (e.error === 'not-allowed') {
        unsupported.style.display = 'flex';
        listening = false;
        return;
      }
      // kurz warten, dann neu starten
      setTimeout(() => { if (listening) try { recognition.start(); } catch (_) {} }, 500);
    };
  }

  function activateByWakeWord() {
    wakeMode = false;
    synth && synth.cancel();
    setState('listening');
    // Kurzes Aktivierungssignal
    addBubble('⚡ JARVIS aktiviert — sprich jetzt', 'jarvis');
    speak('Bereit.');
    clearTimeout(commandTimeout);
    // Nach 10 Sekunden ohne Befehl wieder schlafen
    commandTimeout = setTimeout(() => {
      wakeMode = true;
      setState('idle');
    }, 10000);
  }

  function startContinuousListening() {
    if (!recognition || listening) return;
    listening = true;
    wakeMode = true;
    micBtn.classList.add('active');
    setState('idle');
    startMicMeter();
    try { recognition.start(); } catch (e) {}
  }

  function toggleListen() {
    if (apiOverlay.style.display !== 'none') return;
    if (!recognition) { textInput.focus(); return; }
    if (listening) {
      // Manuell deaktivieren
      listening = false;
      wakeMode = true;
      clearTimeout(commandTimeout);
      micBtn.classList.remove('active');
      stopMicMeter();
      try { recognition.stop(); } catch (e) {}
      setState('idle');
    } else {
      startContinuousListening();
    }
  }

  micBtn.addEventListener('click', toggleListen);
  orbCanvas.addEventListener('click', () => {
    // Orb-Klick: wenn schläft → Wake-Word-Modus verlassen und direkt aktivieren
    if (listening && wakeMode) { activateByWakeWord(); }
    else { toggleListen(); }
  });
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
    // Beim ersten Klick: begrüßen + Mikrofon dauerhaft starten
    window.addEventListener('pointerdown', () => {
      greetOnce();
      setTimeout(startContinuousListening, 800);
    }, { once: true });
  }
})();
