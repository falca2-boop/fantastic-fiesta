/**
 * JARVIS – Orb-Animation (Iron-Man-Stil)
 * Exportiert setState(state) für app.js
 */
const canvas = document.getElementById('orb-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2, R = 60;

const STATES = {
  idle:      { base: '#0af', glow: 'rgba(0,170,255,0.3)', pulse: 0.3, rings: 2 },
  listening: { base: '#0ff', glow: 'rgba(0,255,255,0.5)', pulse: 1.2, rings: 3 },
  thinking:  { base: '#fa0', glow: 'rgba(255,160,0,0.5)',  pulse: 0.8, rings: 2 },
  speaking:  { base: '#0f9', glow: 'rgba(0,255,140,0.5)',  pulse: 1.5, rings: 3 },
  error:     { base: '#f05', glow: 'rgba(255,0,80,0.4)',   pulse: 0.4, rings: 1 },
};

let current = STATES.idle;
let t = 0;
let energy = 0; // 0–1, für Wellen-Amplitude

export function setState(state, amp = 0) {
  current = STATES[state] ?? STATES.idle;
  energy = Math.min(1, Math.max(0, amp));
}

export function setEnergy(v) { energy = Math.min(1, Math.max(0, v)); }

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function draw() {
  t += 0.016;
  ctx.clearRect(0, 0, W, H);

  const pulse = 1 + Math.sin(t * current.pulse * Math.PI * 2) * 0.04 + energy * 0.08;
  const r = R * pulse;

  // Outer rings
  for (let i = 0; i < current.rings; i++) {
    const rr = r + 18 + i * 14 + Math.sin(t * 1.5 + i) * 3;
    const alpha = (0.15 - i * 0.04) * (1 + energy * 0.5);
    ctx.beginPath();
    ctx.arc(CX, CY, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${hexToRgb(current.base)},${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Glow
  const grad = ctx.createRadialGradient(CX, CY, r * 0.3, CX, CY, r * 1.6);
  grad.addColorStop(0, `rgba(${hexToRgb(current.base)},0.25)`);
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(CX, CY, r * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Core
  const core = ctx.createRadialGradient(CX - r * 0.25, CY - r * 0.25, 2, CX, CY, r);
  core.addColorStop(0, '#fff');
  core.addColorStop(0.3, current.base);
  core.addColorStop(1, '#001a30');
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();

  // Rim light
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.strokeStyle = current.base;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Arc decorations (rotating)
  for (let i = 0; i < 4; i++) {
    const angle = t * 0.4 + (i * Math.PI) / 2;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, -0.3, 0.3);
    ctx.strokeStyle = `rgba(${hexToRgb(current.base)},0.5)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

draw();

// Make setState available globally for app.js
window.orbSetState = setState;
window.orbSetEnergy = setEnergy;
