/**
 * JARVIS – Goldener Brain-Orb (inspiriert vom HUD-Design)
 */
const canvas = document.getElementById('orb-canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, CX = W/2, CY = H/2, R = 72;

const STATES = {
  idle:      { base: '#c8912a', glow: 'rgba(200,145,42,0.4)',  speed: 0.4, rings: 3 },
  listening: { base: '#e8c060', glow: 'rgba(232,192,96,0.6)',  speed: 1.2, rings: 4 },
  thinking:  { base: '#e08030', glow: 'rgba(224,128,48,0.55)', speed: 0.9, rings: 3 },
  speaking:  { base: '#60d890', glow: 'rgba(96,216,144,0.5)',  speed: 1.6, rings: 4 },
  error:     { base: '#c03030', glow: 'rgba(192,48,48,0.4)',   speed: 0.3, rings: 2 },
};

let cur = STATES.idle;
let t = 0, energy = 0;

export function setState(s, e = 0) {
  cur = STATES[s] ?? STATES.idle;
  energy = Math.min(1, Math.max(0, e));
}
export function setEnergy(v) { energy = Math.min(1, Math.max(0, v)); }

function hexRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function draw() {
  t += 0.014;
  ctx.clearRect(0, 0, W, H);

  const pulse = 1 + Math.sin(t * cur.speed * Math.PI * 2) * 0.03 + energy * 0.07;
  const r = R * pulse;
  const [rr, gg, bb] = hexRgb(cur.base);

  // ── Outer scan rings ──
  for (let i = 0; i < cur.rings; i++) {
    const rr2 = r + 20 + i * 18 + Math.sin(t * 1.1 + i * 1.3) * 4;
    const alpha = (0.18 - i * 0.04) + energy * 0.08;
    ctx.beginPath();
    ctx.arc(CX, CY, rr2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha.toFixed(2)})`;
    ctx.lineWidth = i === 0 ? 1.5 : 0.8;
    ctx.stroke();
  }

  // ── Rotating arc segments ──
  for (let i = 0; i < 6; i++) {
    const angle = t * cur.speed * 0.5 + (i * Math.PI) / 3;
    const arcR = r + 12;
    const span = 0.25 + Math.sin(t * 0.7 + i) * 0.1;
    ctx.beginPath();
    ctx.arc(CX, CY, arcR, angle, angle + span);
    ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.5)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Counter-rotating arcs
  for (let i = 0; i < 4; i++) {
    const angle = -t * cur.speed * 0.3 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(CX, CY, r + 28, angle, angle + 0.4);
    ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.25)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Glow halo ──
  const halo = ctx.createRadialGradient(CX, CY, r * 0.5, CX, CY, r * 1.8);
  halo.addColorStop(0, `rgba(${rr},${gg},${bb},0.3)`);
  halo.addColorStop(0.5, `rgba(${rr},${gg},${bb},0.08)`);
  halo.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(CX, CY, r * 1.8, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();

  // ── Sphere body ──
  const sphere = ctx.createRadialGradient(CX - r * 0.3, CY - r * 0.3, r * 0.05, CX, CY, r);
  sphere.addColorStop(0, `rgba(${rr+60},${gg+40},${bb+10},0.95)`);
  sphere.addColorStop(0.4, `rgba(${rr},${gg},${bb},0.85)`);
  sphere.addColorStop(0.8, `rgba(${Math.round(rr*0.4)},${Math.round(gg*0.3)},${Math.round(bb*0.1)},0.9)`);
  sphere.addColorStop(1, 'rgba(4,4,2,0.95)');
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fillStyle = sphere;
  ctx.fill();

  // ── Neural network lines inside sphere ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, r - 2, 0, Math.PI * 2);
  ctx.clip();
  const nodes = [
    [CX, CY - 20], [CX - 22, CY + 10], [CX + 22, CY + 10],
    [CX - 10, CY - 5], [CX + 10, CY - 5], [CX, CY + 20],
    [CX - 15, CY + 25], [CX + 15, CY + 25],
  ];
  const edges = [[0,3],[0,4],[3,4],[3,1],[4,2],[1,5],[2,5],[5,6],[5,7],[1,6],[2,7]];
  ctx.strokeStyle = `rgba(${rr+40},${gg+30},${bb},0.3)`;
  ctx.lineWidth = 0.8;
  for (const [a,b] of edges) {
    ctx.beginPath();
    ctx.moveTo(nodes[a][0], nodes[a][1]);
    ctx.lineTo(nodes[b][0], nodes[b][1]);
    ctx.stroke();
  }
  for (const [nx, ny] of nodes) {
    ctx.beginPath();
    ctx.arc(nx, ny, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rr+80},${gg+60},${bb+10},0.6)`;
    ctx.fill();
  }
  ctx.restore();

  // ── Specular highlight ──
  const spec = ctx.createRadialGradient(CX - r*0.3, CY - r*0.35, 1, CX - r*0.1, CY - r*0.1, r*0.5);
  spec.addColorStop(0, 'rgba(255,240,200,0.35)');
  spec.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();

  // ── Rim ──
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.7)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  requestAnimationFrame(draw);
}

draw();

window.orbSetState  = setState;
window.orbSetEnergy = setEnergy;
