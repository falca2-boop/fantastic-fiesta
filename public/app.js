/**
 * JARVIS – Frontend-Logik
 * - Login / Token-Prüfung
 * - Spracherkennung (Wake-Word „Hey Jarvis" + Push-to-Talk via Orb-Klick)
 * - Chat mit Server
 * - Sprachausgabe (ElevenLabs via Server, Fallback: Browser-TTS)
 * - Waveform-Visualisierung
 */

// ── Token / Login ────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('jarvis_token') ?? ''; }
function setToken(t) { localStorage.setItem('jarvis_token', t); }

function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers ?? {}) },
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  return res;
}

const loginOverlay = document.getElementById('login-overlay');
const tokenInput = document.getElementById('token-input');
const loginBtn = document.getElementById('login-btn');
const loginErr = document.getElementById('login-err');

async function checkAuth() {
  try {
    const r = await fetch('/api/health', { headers: authHeader() });
    if (r.status === 401) { showLogin(); return false; }
    return true;
  } catch { return false; }
}

function showLogin() { loginOverlay.classList.remove('hidden'); }
function hideLogin() { loginOverlay.classList.add('hidden'); }

loginBtn.addEventListener('click', async () => {
  loginErr.textContent = '';
  const token = tokenInput.value.trim();
  if (!token) return;
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (r.ok) {
      setToken(token);
      hideLogin();
      init();
    } else {
      loginErr.textContent = 'Falsches Token.';
    }
  } catch { loginErr.textContent = 'Verbindungsfehler.'; }
});
tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

// ── UI-Elemente ───────────────────────────────────────────────────────────────

const statusEl    = document.getElementById('status');
const replyPanel  = document.getElementById('reply-panel');
const replyText   = document.getElementById('reply-text');
const transcriptEl = document.getElementById('transcript-panel');
const textInput   = document.getElementById('text-input');
const sendBtn     = document.getElementById('send-btn');
const clearBtn    = document.getElementById('clear-btn');
const orbWrap     = document.getElementById('orb-wrap');
const orbHint     = document.getElementById('orb-hint');
const dotMic      = document.getElementById('dot-mic');
const dotApi      = document.getElementById('dot-api');
const dotVoice    = document.getElementById('dot-voice');

// Status dots
function setDot(el, state) { // 'active' | 'warn' | 'error' | ''
  el.className = 'dot' + (state ? ' ' + state : '');
}

// ── State ─────────────────────────────────────────────────────────────────────

let uiState = 'idle'; // idle | listening | thinking | speaking
let isBusy = false;

function setState(s) {
  uiState = s;
  statusEl.className = s === 'idle' ? '' : s;
  const labels = { idle: 'BEREIT', listening: 'HÖRE ZU …', thinking: 'DENKE …', speaking: 'ANTWORTE …', error: 'FEHLER' };
  statusEl.textContent = labels[s] ?? s.toUpperCase();
  window.orbSetState?.(s);
  replyPanel.classList.toggle('active', s === 'speaking');
}

// ── Transcript ────────────────────────────────────────────────────────────────

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="role">${role === 'user' ? 'DU' : 'JARVIS'}</div>${text}`;
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  if (transcriptEl.children.length > 40)
    transcriptEl.removeChild(transcriptEl.firstChild);
}

// ── Waveform ──────────────────────────────────────────────────────────────────

const waveCanvas = document.getElementById('wave-canvas');
const wctx = waveCanvas.getContext('2d');
let analyser = null;
let waveAnim = null;

function drawWave() {
  const W = waveCanvas.width, H = waveCanvas.height;
  wctx.clearRect(0, 0, W, H);
  if (!analyser) { waveAnim = requestAnimationFrame(drawWave); return; }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  wctx.beginPath();
  wctx.strokeStyle = 'rgba(0,170,255,0.7)';
  wctx.lineWidth = 1.5;
  const step = W / data.length;
  let energy = 0;
  for (let i = 0; i < data.length; i++) {
    const y = ((data[i] / 128) - 1) * (H / 2) + H / 2;
    energy += Math.abs(data[i] - 128);
    if (i === 0) wctx.moveTo(0, y);
    else wctx.lineTo(i * step, y);
  }
  wctx.stroke();
  window.orbSetEnergy?.(energy / data.length / 60);
  waveAnim = requestAnimationFrame(drawWave);
}
requestAnimationFrame(drawWave);

// ── Mikrofon ──────────────────────────────────────────────────────────────────

let audioCtx = null;
let micStream = null;

async function initMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    setDot(dotMic, 'active');
    return true;
  } catch (e) {
    console.warn('Mikrofon:', e.message);
    setDot(dotMic, 'error');
    return false;
  }
}

// ── Spracherkennung ───────────────────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;
let wakeLocked = false; // verhindert Doppel-Auslösung

function startWakeWordListener() {
  if (!SpeechRecognition) { orbHint.textContent = 'Spracherkennung nicht verfügbar (Chrome/Edge)'; return; }

  recognition = new SpeechRecognition();
  recognition.lang = 'de-DE';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = e => {
    if (isBusy) return;
    const result = e.results[e.results.length - 1];
    if (!result.isFinal) return;
    const transcript = result[0].transcript.toLowerCase().trim();

    const wakeWords = ['hey jarvis', 'jarvis', 'hei jarvis', 'jar vis'];
    const hasWake = wakeWords.some(w => transcript.includes(w));

    if (hasWake && !wakeLocked) {
      wakeLocked = true;
      setTimeout(() => { wakeLocked = false; }, 2000);
      // Alles nach dem Wake-Word als Befehl nehmen, oder neu hören
      let cmd = transcript;
      for (const w of wakeWords) {
        cmd = cmd.replace(w, '').trim();
      }
      if (cmd.length > 2) {
        // Befehl direkt aus dem Wake-Word-Ergebnis
        recognition.stop();
        processVoiceCommand(cmd);
      } else {
        // Separat lauschen
        recognition.stop();
        listenForCommand();
      }
    }
  };

  recognition.onend = () => {
    if (!isBusy) setTimeout(() => recognition?.start(), 300);
  };
  recognition.onerror = e => {
    if (e.error !== 'no-speech' && e.error !== 'aborted')
      console.warn('SR error:', e.error);
  };

  recognition.start();
  orbHint.textContent = '„Hey Jarvis" oder klicken';
}

function listenForCommand() {
  if (!SpeechRecognition) return;
  setState('listening');
  orbHint.textContent = 'Spreche …';

  const r = new SpeechRecognition();
  r.lang = 'de-DE';
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 1;

  let gotResult = false;

  r.onresult = e => {
    gotResult = true;
    const cmd = e.results[0][0].transcript.trim();
    processVoiceCommand(cmd);
  };

  r.onend = () => {
    if (!gotResult) {
      setState('idle');
      orbHint.textContent = '„Hey Jarvis" oder klicken';
      setTimeout(() => recognition?.start(), 300);
    }
  };

  r.onerror = e => {
    console.warn('listen error:', e.error);
    setState('error');
    setTimeout(() => { setState('idle'); recognition?.start(); }, 2000);
  };

  r.start();
}

async function processVoiceCommand(text) {
  if (!text) { setState('idle'); return; }
  addMessage('user', text);
  await sendMessage(text);
  setTimeout(() => { startWakeWordListener(); }, 400);
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function sendMessage(text) {
  if (isBusy) return;
  isBusy = true;
  setState('thinking');
  setDot(dotApi, 'warn');
  orbHint.textContent = '';

  try {
    const r = await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
    const data = await r.json();
    setDot(dotApi, 'active');

    if (!r.ok) throw new Error(data.error ?? r.status);

    const reply = data.reply ?? '';
    replyText.textContent = reply;
    addMessage('jarvis', reply);
    await speakReply(reply);

  } catch (e) {
    if (e.message !== 'unauthorized') {
      setDot(dotApi, 'error');
      setState('error');
      replyText.textContent = 'Fehler: ' + e.message;
      setTimeout(() => setState('idle'), 3000);
    }
  } finally {
    isBusy = false;
    orbHint.textContent = '„Hey Jarvis" oder klicken';
  }
}

// ── Sprachausgabe ─────────────────────────────────────────────────────────────

let currentAudio = null;

async function speakReply(text) {
  if (!text) return;
  setState('speaking');

  // Versuche zuerst ElevenLabs via Server
  try {
    const r = await apiFetch('/api/speak', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });

    if (r.status === 204) {
      // Kein ElevenLabs → Browser-TTS
      await browserSpeak(text);
      return;
    }

    if (!r.ok) throw new Error('speak ' + r.status);

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    setDot(dotVoice, 'active');

    await new Promise((resolve, reject) => {
      currentAudio = new Audio(url);
      currentAudio.onended = resolve;
      currentAudio.onerror = reject;
      currentAudio.play().catch(reject);
    });

    URL.revokeObjectURL(url);
    setDot(dotVoice, 'active');
  } catch (e) {
    console.warn('ElevenLabs:', e.message, '→ Browser-TTS');
    setDot(dotVoice, 'warn');
    await browserSpeak(text);
  } finally {
    setState('idle');
  }
}

function browserSpeak(text) {
  return new Promise(resolve => {
    if (!window.speechSynthesis) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'de-DE';
    utt.rate = 1.0;
    utt.pitch = 0.9;
    // Präferiere eine tiefe männliche Stimme
    const voices = window.speechSynthesis.getVoices();
    const pref = voices.find(v => v.lang.startsWith('de') && /male|männlich|man/i.test(v.name));
    const de = voices.find(v => v.lang.startsWith('de'));
    if (pref) utt.voice = pref;
    else if (de) utt.voice = de;
    utt.onend = resolve;
    utt.onerror = resolve;
    window.speechSynthesis.speak(utt);
    setDot(dotVoice, 'warn'); // warn = Browser-TTS (kein ElevenLabs)
  });
}

// ── Orb-Klick (Push-to-Talk) ──────────────────────────────────────────────────

orbWrap.addEventListener('click', () => {
  if (isBusy) return;
  recognition?.stop();
  listenForCommand();
});

// ── Text-Eingabe ───────────────────────────────────────────────────────────────

async function handleTextSend() {
  const text = textInput.value.trim();
  if (!text || isBusy) return;
  textInput.value = '';
  addMessage('user', text);
  await sendMessage(text);
}

sendBtn.addEventListener('click', handleTextSend);
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleTextSend(); });

clearBtn.addEventListener('click', () => {
  transcriptEl.innerHTML = '';
  replyText.textContent = '—';
});

// ── Initialisierung ───────────────────────────────────────────────────────────

async function init() {
  setState('idle');
  await initMic();
  await checkVoice();
  startWakeWordListener();
}

async function checkVoice() {
  // Kurzer Test ob /api/speak ElevenLabs hat (204 = nein, 200 = ja)
  try {
    const r = await apiFetch('/api/speak', {
      method: 'POST',
      body: JSON.stringify({ text: ' ' }),
    });
    setDot(dotVoice, r.status === 204 ? 'warn' : 'active');
  } catch { setDot(dotVoice, 'warn'); }
}

(async () => {
  const ok = await checkAuth();
  if (ok) await init();
})();
