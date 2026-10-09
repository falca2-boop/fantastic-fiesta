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
  // Key aus config.js (lokal, nicht auf GitHub) oder localStorage
  let ANTHROPIC_KEY = (window.JARVIS_CONFIG && window.JARVIS_CONFIG.anthropicKey)
    || localStorage.getItem('jarvis_api_key') || '';

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

  // ---------- Persistenter Speicher ----------
  const STORE_KEY = 'jarvis_store_v2';
  const store = (() => {
    try { return Object.assign({ tasks: [], notes: [], reminders: [], facts: [], goal: null, history: [] },
      JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); }
    catch { return { tasks: [], notes: [], reminders: [], facts: [], goal: null, history: [] }; }
  })();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} renderPanel(); }
  const uid = () => Math.random().toString(36).slice(2, 8);
  const fmtTime = (iso) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ---------- Ziel- & Aufgaben-Panel ----------
  function setGoal(text, schritte, realisierbarkeit) {
    store.goal = { text, schritte: schritte || [], realisierbarkeit };
    save();
  }
  function renderPanel() {
    if (store.goal) {
      let html = `Ziel: <strong style="color:#eafaff"></strong>`;
      goalText.innerHTML = html;
      goalText.querySelector('strong').textContent = store.goal.text.slice(0, 80);
      if (store.goal.realisierbarkeit != null) {
        const sp = document.createElement('span');
        sp.style.cssText = 'font-size:11px;color:#6f8aa0;letter-spacing:2px';
        sp.textContent = ` · ${store.goal.realisierbarkeit}% realisierbar`;
        goalText.appendChild(sp);
      }
      goalPanel.classList.add('show');
    }
    const open = store.tasks.filter(t => !t.done);
    const rem = store.reminders.filter(r => !r.fired).sort((x, y) => new Date(x.at) - new Date(y.at));
    const el = document.getElementById('sidePanel');
    if (!el) return;
    el.innerHTML = '';
    const section = (title, items) => {
      if (!items.length) return;
      const h = document.createElement('div'); h.className = 'lbl'; h.textContent = title; el.appendChild(h);
      items.forEach(t => { const d = document.createElement('div'); d.className = 'item'; d.textContent = t; el.appendChild(d); });
    };
    section('Aufgaben', open.map(t => '▸ ' + t.text + (t.due ? ` (${t.due})` : '')));
    section('Erinnerungen', rem.map(r => '⏰ ' + fmtTime(r.at) + ' · ' + r.text));
    el.classList.toggle('show', !!(open.length || rem.length));
  }

  // ---------- Erinnerungen ----------
  function checkReminders() {
    const now = Date.now();
    let changed = false;
    store.reminders.forEach(r => {
      if (!r.fired && new Date(r.at).getTime() <= now) {
        r.fired = true; changed = true;
        const msg = 'Erinnerung: ' + r.text;
        jarvisSay(msg);
        try { if (window.Notification && Notification.permission === 'granted') new Notification('JARVIS', { body: r.text }); } catch (e) {}
      }
    });
    if (changed) save();
  }
  setInterval(checkReminders, 15000);

  // ---------- Werkzeuge ----------
  const N8N_URL = (window.JARVIS_CONFIG && window.JARVIS_CONFIG.n8nWebhook) || '';

  const TOOLS = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: 4 },
    { name: 'add_task', description: 'Fügt eine Aufgabe zur To-do-Liste hinzu.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, due: { type: 'string', description: 'Optional: Fälligkeit, z.B. "morgen" oder 2026-10-12' } }, required: ['text'] } },
    { name: 'list_tasks', description: 'Listet alle Aufgaben mit IDs und Status.', input_schema: { type: 'object', properties: {} } },
    { name: 'complete_task', description: 'Markiert eine Aufgabe als erledigt (ID aus list_tasks oder Systemkontext).',
      input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'add_note', description: 'Speichert eine Notiz.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'list_notes', description: 'Listet alle gespeicherten Notizen.', input_schema: { type: 'object', properties: {} } },
    { name: 'set_reminder', description: 'Setzt eine Erinnerung, die JARVIS zur Zeit laut ausspricht (Tab muss offen sein). Zeit als lokales Datum "YYYY-MM-DDTHH:MM", berechnet aus der aktuellen Zeit im Systemkontext.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, at: { type: 'string' } }, required: ['text', 'at'] } },
    { name: 'remember', description: 'Merkt dauerhaft einen Fakt über den Nutzer (Vorlieben, Namen, Routinen, Hintergrund).',
      input_schema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] } },
    { name: 'forget', description: 'Vergisst gespeicherte Fakten, die den Suchtext enthalten.',
      input_schema: { type: 'object', properties: { contains: { type: 'string' } }, required: ['contains'] } },
    { name: 'set_goal', description: 'Setzt das aktuelle Hauptziel des Nutzers mit Plan.',
      input_schema: { type: 'object', properties: { text: { type: 'string' }, schritte: { type: 'array', items: { type: 'string' } }, realisierbarkeit: { type: 'number', description: '0-100' } }, required: ['text'] } },
  ];
  if (N8N_URL) {
    TOOLS.push({ name: 'external_action',
      description: 'Führt eine Aktion in externen Diensten über n8n aus (E-Mail senden, Kalendereintrag, Notion-Seite …). Vorher IMMER Inhalt mit dem Nutzer bestätigen, nie ungefragt senden.',
      input_schema: { type: 'object', properties: { action: { type: 'string', description: 'z.B. send_email, create_event, create_notion_page' }, details: { type: 'object' } }, required: ['action', 'details'] } });
  }

  async function runTool(name, input) {
    switch (name) {
      case 'add_task': { const t = { id: uid(), text: input.text, due: input.due || '', done: false }; store.tasks.push(t); save(); return `Aufgabe gespeichert (ID ${t.id}).`; }
      case 'list_tasks': return store.tasks.length ? store.tasks.map(t => `${t.id} [${t.done ? 'x' : ' '}] ${t.text}${t.due ? ' (' + t.due + ')' : ''}`).join('\n') : 'Keine Aufgaben.';
      case 'complete_task': { const t = store.tasks.find(x => x.id === input.id); if (!t) return 'Aufgabe nicht gefunden.'; t.done = true; save(); return 'Erledigt: ' + t.text; }
      case 'add_note': store.notes.push({ id: uid(), text: input.text, ts: new Date().toISOString() }); save(); return 'Notiz gespeichert.';
      case 'list_notes': return store.notes.length ? store.notes.map(n => `- ${n.text} (${fmtTime(n.ts)})`).join('\n') : 'Keine Notizen.';
      case 'set_reminder': {
        const d = new Date(input.at);
        if (isNaN(d)) return 'Ungültige Zeit. Format: YYYY-MM-DDTHH:MM';
        if (d.getTime() < Date.now()) return 'Die Zeit liegt in der Vergangenheit.';
        store.reminders.push({ id: uid(), text: input.text, at: d.toISOString(), fired: false });
        save();
        try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
        return 'Erinnerung gesetzt für ' + fmtTime(d.toISOString()) + '.';
      }
      case 'remember': if (!store.facts.includes(input.fact)) store.facts.push(input.fact); save(); return 'Gemerkt.';
      case 'forget': { const n = store.facts.length; store.facts = store.facts.filter(f => !f.toLowerCase().includes(input.contains.toLowerCase())); save(); return `${n - store.facts.length} Fakt(en) vergessen.`; }
      case 'set_goal': setGoal(input.text, input.schritte, input.realisierbarkeit); return 'Ziel gesetzt.';
      case 'external_action': {
        const res = await fetch(N8N_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const body = await res.text();
        return res.ok ? (body.slice(0, 1500) || 'Ausgeführt.') : 'Fehler vom Workflow: HTTP ' + res.status;
      }
      default: return 'Unbekanntes Werkzeug.';
    }
  }

  // ---------- Claude Agent ----------
  function systemPrompt() {
    const open = store.tasks.filter(t => !t.done).map(t => `${t.id}: ${t.text}${t.due ? ' (' + t.due + ')' : ''}`).join('; ') || 'keine';
    return `Du bist JARVIS, der persönliche KI-Assistent des Nutzers im Stil von Iron Man: souverän, trocken-höflich, effizient. Du arbeitest FÜR den Nutzer und erledigst Dinge aktiv mit deinen Werkzeugen, statt nur Ratschläge zu geben.
Antworte auf Deutsch, gesprochen und kurz (1-3 Sätze), ohne Markdown, Listen oder Emojis, weil deine Antwort vorgelesen wird. Nutze Werkzeuge direkt, wenn der Nutzer etwas speichern, planen, erinnern oder recherchieren will. Für aktuelle Fakten nutze web_search und fasse knapp zusammen. Fürs Tagesplanen: lies Aufgaben und Erinnerungen und schlage eine konkrete Reihenfolge vor. Speichere dauerhaft relevante Infos über den Nutzer mit remember. Vor externen Aktionen (E-Mail senden usw.) bestätige den Inhalt erst mit dem Nutzer. Erfinde keine Ergebnisse; wenn ein Werkzeug fehlt, sage es ehrlich.
Aktuelle Zeit: ${new Date().toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })} (ISO lokal: ${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}).
Bekannte Fakten über den Nutzer: ${store.facts.join('; ') || 'noch keine'}.
Offene Aufgaben: ${open}.
Aktuelles Ziel: ${store.goal ? store.goal.text : 'keins'}.`;
  }

  async function callApi(messages) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1500, system: systemPrompt(), tools: TOOLS, messages }),
    });
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('jarvis_api_key'); ANTHROPIC_KEY = ''; throw new Error('invalid_key'); }
      throw new Error('api_error_' + res.status);
    }
    return res.json();
  }

  async function askClaude(userMessage) {
    if (!ANTHROPIC_KEY) return null;
    const messages = store.history.concat([{ role: 'user', content: userMessage }]);
    let data;
    for (let i = 0; i < 8; i++) {
      data = await callApi(messages);
      if (data.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: data.content });
        const results = [];
        for (const block of data.content) {
          if (block.type !== 'tool_use') continue;
          let out;
          try { out = await runTool(block.name, block.input || {}); }
          catch (e) { out = 'Fehler: ' + e.message; }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: String(out) });
        }
        messages.push({ role: 'user', content: results });
      } else if (data.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: data.content });
      } else break;
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim()
      || 'Erledigt.';
    store.history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: text });
    store.history = store.history.slice(-20);
    save();
    return text;
  }

  // ---------- Hauptlogik ----------
  async function respond(text) {
    setState('thinking');
    if (!ANTHROPIC_KEY) {
      jarvisSay('Ich brauche einen API Key, um für dich zu arbeiten. Lade die Seite neu und gib ihn ein.');
      return;
    }
    try {
      jarvisSay(await askClaude(text));
    } catch (err) {
      jarvisSay(err.message === 'invalid_key'
        ? 'Der API Key ist ungültig. Bitte lade die Seite neu und gib einen gültigen Key ein.'
        : 'Verbindungsfehler. Bitte versuche es erneut.');
      setState('idle');
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
  renderPanel();
  checkReminders();

  let greeted = false;
  function greetOnce() {
    if (greeted) return; greeted = true;
    const open = store.tasks.filter(t => !t.done).length;
    jarvisSay(ANTHROPIC_KEY
      ? `Systeme online.${open ? ` Du hast ${open} offene Aufgabe${open > 1 ? 'n' : ''}.` : ''} Was soll ich für dich erledigen?`
      : 'Systeme online, aber ohne API Key kann ich nicht für dich arbeiten.');
  }

  initApiOverlay();
  if (ANTHROPIC_KEY) {
    window.addEventListener('pointerdown', greetOnce, { once: true });
  }
})();
