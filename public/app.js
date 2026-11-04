/**
 * JARVIS – Frontend
 */

// ── Token / Login ────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('jarvis_token') ?? ''; }
function setToken(t) { localStorage.setItem('jarvis_token', t); }
function authHdr() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function apiFetch(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHdr(), ...(opts.headers ?? {}) },
  });
  if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
  return r;
}

const loginOverlay = document.getElementById('login-overlay');
const tokenInput   = document.getElementById('token-input');
const loginBtn     = document.getElementById('login-btn');
const loginErr     = document.getElementById('login-err');

async function checkAuth() {
  const r = await fetch('/api/health', { headers: authHdr() }).catch(() => null);
  if (!r || r.status === 401) { showLogin(); return false; }
  return true;
}
function showLogin() { loginOverlay.classList.remove('hidden'); }
function hideLogin() { loginOverlay.classList.add('hidden'); }

loginBtn.addEventListener('click', async () => {
  loginErr.textContent = '';
  const token = tokenInput.value.trim();
  if (!token) return;
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).catch(() => null);
  if (r?.ok) { setToken(token); hideLogin(); init(); }
  else loginErr.textContent = 'Falsches Token.';
});
tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

// ── UI refs ───────────────────────────────────────────────────────────────────
const statusEl    = document.getElementById('status');
const replyBox    = document.getElementById('reply-box');
const transcriptEl= document.getElementById('transcript');
const textInput   = document.getElementById('text-input');
const sendBtn     = document.getElementById('send-btn');
const clearBtn    = document.getElementById('clear-btn');
const orbWrap     = document.getElementById('orb-wrap');
const orbHint     = document.getElementById('orb-hint');
const dotMic      = document.getElementById('dot-mic');
const dotApi      = document.getElementById('dot-api');
const dotVoice    = document.getElementById('dot-voice');
const clockEl     = document.getElementById('clock');
const statState   = document.getElementById('stat-state');
const statTasks   = document.getElementById('stat-tasks');
const statUptime  = document.getElementById('stat-uptime');
const lastQuery   = document.getElementById('last-query');
const gaugeCircle = document.getElementById('gauge-circle');
const gaugePct    = document.getElementById('gauge-pct');

function setDot(el, s) { el.className = 'dot-led' + (s ? ' ' + s : ''); }

// ── Clock ─────────────────────────────────────────────────────────────────────
const startTime = Date.now();
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  clockEl.textContent = `${hh}:${mm}:${ss}`;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const uh = String(Math.floor(elapsed/3600)).padStart(2,'0');
  const um = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
  statUptime.textContent = `${uh}:${um}`;
}
setInterval(updateClock, 1000);

// ── Gauge ─────────────────────────────────────────────────────────────────────
let gaugeValue = 0;
function setGauge(pct) {
  gaugeValue = Math.min(100, Math.max(0, pct));
  const circumference = 138;
  gaugeCircle.style.strokeDashoffset = circumference - (circumference * gaugeValue / 100);
  gaugePct.textContent = Math.round(gaugeValue) + '%';
}
setGauge(0);
// Animate gauge slowly
setInterval(() => {
  if (isBusy) setGauge(Math.min(100, gaugeValue + 2));
  else setGauge(Math.max(0, gaugeValue - 1));
}, 80);

// ── Freq bars (left panel) ────────────────────────────────────────────────────
const freqBarsEl = document.getElementById('freq-bars');
const NUM_FREQ = 16;
const freqBars = [];
for (let i = 0; i < NUM_FREQ; i++) {
  const b = document.createElement('div');
  b.className = 'bar';
  b.style.height = '4px';
  freqBarsEl.appendChild(b);
  freqBars.push(b);
}
function updateFreqBars(data) {
  for (let i = 0; i < NUM_FREQ; i++) {
    const v = data ? (data[Math.floor(i * data.length / NUM_FREQ)] / 255) : (Math.random() * 0.15);
    freqBars[i].style.height = Math.max(2, v * 28) + 'px';
    freqBars[i].style.opacity = 0.3 + v * 0.7;
  }
}
setInterval(() => { if (!analyser) updateFreqBars(null); }, 120);

// ── Wave bars (right panel) ───────────────────────────────────────────────────
const waveBarsEl = document.getElementById('wave-bars');
const NUM_WAVE = 32;
const waveBars = [];
for (let i = 0; i < NUM_WAVE; i++) {
  const b = document.createElement('div');
  b.className = 'wave-bar';
  b.style.height = '3px';
  waveBarsEl.appendChild(b);
  waveBars.push(b);
}
function updateWaveBars(data) {
  for (let i = 0; i < NUM_WAVE; i++) {
    const v = data ? Math.abs((data[Math.floor(i * data.length / NUM_WAVE)] / 128) - 1) : (Math.random() * 0.08);
    waveBars[i].style.height = Math.max(2, v * 50) + 'px';
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let uiState = 'idle', isBusy = false;

function setState(s) {
  uiState = s;
  statusEl.className = s === 'idle' ? '' : s;
  const labels = { idle: 'BEREIT', listening: 'HÖRE ZU', thinking: 'VERARBEITE', speaking: 'ANTWORTE', error: 'FEHLER' };
  statusEl.textContent = labels[s] ?? s.toUpperCase();
  statState.textContent = labels[s] ?? s.toUpperCase();
  replyBox.classList.toggle('active', s === 'speaking');
  window.orbSetState?.(s);
}

// ── Transcript ────────────────────────────────────────────────────────────────
function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = `msg ${role}`;
  d.innerHTML = `<div class="role">${role === 'user' ? 'DU' : 'JARVIS'}</div>${text}`;
  transcriptEl.appendChild(d);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  if (transcriptEl.children.length > 50) transcriptEl.removeChild(transcriptEl.firstChild);
  if (role === 'user') lastQuery.textContent = text.slice(0, 80);
}

// ── Waveform canvas ───────────────────────────────────────────────────────────
const waveCanvas = document.getElementById('wave-canvas');
const wctx = waveCanvas.getContext('2d');
let analyser = null;

function drawWave() {
  const W2 = waveCanvas.width, H2 = waveCanvas.height;
  wctx.clearRect(0, 0, W2, H2);
  if (analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    wctx.beginPath();
    wctx.strokeStyle = 'rgba(200,145,42,0.6)';
    wctx.lineWidth = 1.5;
    const step = W2 / data.length;
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const y = ((data[i] / 128) - 1) * (H2 / 2) + H2 / 2;
      energy += Math.abs(data[i] - 128);
      i === 0 ? wctx.moveTo(0, y) : wctx.lineTo(i * step, y);
    }
    wctx.stroke();
    window.orbSetEnergy?.(energy / data.length / 60);
    updateFreqBars(data);
    updateWaveBars(data);
  }
  requestAnimationFrame(drawWave);
}
requestAnimationFrame(drawWave);

// ── Mic ───────────────────────────────────────────────────────────────────────
let micStream = null;
async function initMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const actx = new AudioContext();
    analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    actx.createMediaStreamSource(micStream).connect(analyser);
    setDot(dotMic, 'on');
    return true;
  } catch { setDot(dotMic, 'err'); return false; }
}

// ── Speech Recognition ────────────────────────────────────────────────────────
const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null, wakeLock = false;

function startWakeWord() {
  if (!SR) { orbHint.textContent = 'Spracherkennung: Chrome/Edge'; return; }
  recognition = new SR();
  recognition.lang = 'de-DE';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = e => {
    if (isBusy) return;
    const result = e.results[e.results.length - 1];
    if (!result.isFinal) return;
    const text = result[0].transcript.toLowerCase().trim();
    const wakes = ['hey jarvis','jarvis','hei jarvis'];
    const hit = wakes.some(w => text.includes(w));
    if (hit && !wakeLock) {
      wakeLock = true;
      setTimeout(() => { wakeLock = false; }, 2000);
      let cmd = text;
      for (const w of wakes) cmd = cmd.replace(w, '').trim();
      recognition.stop();
      if (cmd.length > 2) processVoice(cmd);
      else listenOnce();
    }
  };
  recognition.onend = () => { if (!isBusy) setTimeout(() => recognition?.start(), 300); };
  recognition.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn(e.error); };
  recognition.start();
  orbHint.textContent = '„HEY JARVIS" · KLICK';
}

function listenOnce() {
  if (!SR) return;
  setState('listening');
  orbHint.textContent = 'SPRECHE …';
  const r = new SR();
  r.lang = 'de-DE'; r.continuous = false; r.interimResults = false;
  let got = false;
  r.onresult = e => { got = true; processVoice(e.results[0][0].transcript.trim()); };
  r.onend = () => { if (!got) { setState('idle'); setTimeout(() => recognition?.start(), 300); } };
  r.onerror = e => { console.warn(e.error); setState('error'); setTimeout(() => { setState('idle'); recognition?.start(); }, 2000); };
  r.start();
}

async function processVoice(text) {
  if (!text) { setState('idle'); return; }
  addMsg('user', text);
  await sendMessage(text);
  setTimeout(() => startWakeWord(), 400);
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function sendMessage(text) {
  if (isBusy) return;
  isBusy = true;
  setState('thinking');
  setDot(dotApi, 'warn');

  try {
    const r = await apiFetch('/api/chat', { method:'POST', body: JSON.stringify({ message: text }) });
    const data = await r.json();
    setDot(dotApi, 'on');
    if (!r.ok) throw new Error(data.error ?? r.status);
    const reply = data.reply ?? '';
    replyBox.textContent = reply;
    addMsg('jarvis', reply);
    // State update
    const state = await apiFetch('/api/state').then(r => r.json()).catch(() => null);
    if (state) statTasks.textContent = state.tasks?.filter(t => !t.done).length ?? 0;
    await speakReply(reply);
  } catch(e) {
    if (e.message !== 'unauthorized') {
      setDot(dotApi, 'err');
      setState('error');
      replyBox.textContent = 'Fehler: ' + e.message;
      setTimeout(() => setState('idle'), 3000);
    }
  } finally {
    isBusy = false;
    orbHint.textContent = '„HEY JARVIS" · KLICK';
  }
}

// ── Voice output ──────────────────────────────────────────────────────────────
async function speakReply(text) {
  if (!text) return;
  setState('speaking');
  try {
    const r = await apiFetch('/api/speak', { method:'POST', body: JSON.stringify({ text }) });
    if (r.status === 204) { await browserSpeak(text); return; }
    if (!r.ok) throw new Error('speak ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    setDot(dotVoice, 'on');
    await new Promise((res, rej) => {
      const a = new Audio(url);
      a.onended = res; a.onerror = rej;
      a.play().catch(rej);
    });
    URL.revokeObjectURL(url);
  } catch(e) {
    console.warn('TTS:', e.message);
    setDot(dotVoice, 'warn');
    await browserSpeak(text);
  } finally { setState('idle'); }
}

function browserSpeak(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE'; u.rate = 1.0; u.pitch = 0.9;
    const voices = speechSynthesis.getVoices();
    const de = voices.find(v => v.lang.startsWith('de'));
    if (de) u.voice = de;
    u.onend = resolve; u.onerror = resolve;
    speechSynthesis.speak(u);
    setDot(dotVoice, 'warn');
  });
}

// ── Interactions ──────────────────────────────────────────────────────────────
orbWrap.addEventListener('click', () => { if (isBusy) return; recognition?.stop(); listenOnce(); });

async function handleSend() {
  const text = textInput.value.trim();
  if (!text || isBusy) return;
  textInput.value = '';
  addMsg('user', text);
  await sendMessage(text);
}
sendBtn.addEventListener('click', handleSend);
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });
clearBtn.addEventListener('click', () => { transcriptEl.innerHTML = ''; replyBox.textContent = '—'; lastQuery.textContent = '—'; });

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setState('idle');
  await initMic();
  // Check ElevenLabs
  apiFetch('/api/speak', { method:'POST', body: JSON.stringify({ text: ' ' }) })
    .then(r => setDot(dotVoice, r.status === 204 ? 'warn' : 'on'))
    .catch(() => setDot(dotVoice, 'warn'));
  // Load task count
  apiFetch('/api/state').then(r => r.json()).then(s => {
    statTasks.textContent = s.tasks?.filter(t => !t.done).length ?? 0;
  }).catch(() => {});
  startWakeWord();
}

(async () => { if (await checkAuth()) await init(); })();
