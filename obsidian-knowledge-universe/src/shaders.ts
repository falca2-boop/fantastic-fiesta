/**
 * GLSL für Partikel und Linien. Alle Positionen entstehen auf der GPU:
 *   Position = Knotenposition (aus der Knoten-Textur) + Versatz (rotiert, atmend) + Wabern.
 * So bewegen sich Partikel und Linienenden identisch, und das Layout kann live wachsen,
 * ohne dass 10.000 Partikel pro Frame auf der CPU neu berechnet werden.
 * Zustand pro Knoten (4. Kanal der Textur): -1 versteckt, 0 normal, 1 Nachbar, 2 Fokus, 3 Suchtreffer.
 */
const COMMON = /* glsl */ `
uniform sampler2D uNodes;
uniform int uTexW;
uniform float uTime;
uniform float uAmp;

vec4 nodeAt(float idx) {
  int i = int(idx + 0.5);
  return texelFetch(uNodes, ivec2(i % uTexW, i / uTexW), 0);
}

vec3 particlePos(vec3 base, vec3 off, float seed, float t) {
  float dir = fract(seed * 3.0) > 0.5 ? 1.0 : -1.0;
  float ang = t * (0.05 + 0.09 * fract(seed * 7.0)) * dir;
  float c = cos(ang), s = sin(ang);
  vec3 o = vec3(off.x * c - off.z * s, off.y, off.x * s + off.z * c);
  float breath = 1.0 + 0.07 * sin(t * 0.5 + seed * 21.0);
  float a = seed * 37.0;
  vec3 w = vec3(sin(t * 0.35 + a), sin(t * 0.29 + a * 1.7 + 1.3), sin(t * 0.41 + a * 2.3 + 2.1));
  return base + o * breath + w * uAmp;
}
`;

export const POINTS_VERTEX = /* glsl */ `
${COMMON}
attribute float aNode;
attribute vec3 aOffset;
attribute float aSeed;
attribute vec3 aColor;
attribute float aSize;
attribute float aKind;
attribute float aAlpha;

uniform float uScale;
uniform float uFocus;
uniform float uFogNear;
uniform float uFogFar;
uniform float uMinPx;
uniform float uBrightness;

varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vHl;

void main() {
  vec4 nd = nodeAt(aNode);
  float st = nd.w;
  if (st < -0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0); vAlpha = 0.0; vKind = 0.0; vHl = 0.0;
    return;
  }
  vec3 p = particlePos(nd.xyz, aOffset, aSeed, uTime);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 1.0);
  float tw = 1.0 + 0.22 * sin(uTime * (0.9 + aSeed * 1.8) + aSeed * 60.0);
  float hl = st > 0.5 ? 1.0 : 0.0;
  float boost = st > 1.5 ? 1.0 : (st > 0.5 ? 0.5 : 0.0);
  float size = aSize * tw * (1.0 + 0.45 * boost);
  float px = size * uScale / dist;
  float maxPx = aKind > 1.5 ? 1200.0 : 110.0;
  gl_PointSize = clamp(px, uMinPx, maxPx);
  float small = aKind > 1.5 ? 1.0 : clamp(px / uMinPx, 0.35, 1.0);
  float fade = clamp(1.0 - (dist - uFogNear) / (uFogFar - uFogNear), 0.15, 1.0);
  float dim = mix(1.0, 0.1, uFocus * (1.0 - hl));
  vAlpha = aAlpha * small * fade * dim * (0.8 + 0.4 * tw) * (1.0 + 1.2 * boost) * uBrightness;
  vColor = aColor;
  vKind = aKind;
  vHl = hl;
  gl_Position = projectionMatrix * mv;
}
`;

export const POINTS_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vHl;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;

  if (vKind > 1.5) {                       // Nebel: sehr weicher Schleier
    float a = exp(-d * d * 3.0);
    gl_FragColor = vec4(vColor, a * vAlpha);
    return;
  }
  if (vKind > 0.5) {                       // Tag: leuchtender Ring
    float ring = smoothstep(0.50, 0.58, d) * (1.0 - smoothstep(0.70, 0.80, d));
    float glow = exp(-d * d * 2.5) * 0.35;
    gl_FragColor = vec4(vColor * (0.9 + vHl * 0.8) + 0.25, (ring * 1.2 + glow) * vAlpha);
    return;
  }
  float core = exp(-d * d * 6.0);          // Notiz / Staub: heller Kern mit Halo
  float halo = exp(-d * d * 1.8) * 0.35;
  vec3 col = vColor * (0.55 + 1.4 * core) + vec3(1.0) * core * core * 0.55;
  gl_FragColor = vec4(col, (core + halo) * vAlpha);
}
`;

export const LINES_VERTEX = /* glsl */ `
${COMMON}
attribute float aNode;
attribute float aOther;
attribute vec3 aOffset;
attribute float aSeed;
attribute float aT;
attribute float aPhase;
attribute float aSpeed;
attribute float aActive;
attribute vec3 aColor;
attribute float aIntensity;

uniform float uFocus;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBrightness;

varying vec3 vColor;
varying float vAlpha;
varying float vT;
varying float vPhase;
varying float vSpeed;
varying float vActive;
varying float vHl;

void main() {
  vec4 nd = nodeAt(aNode);
  vec4 od = nodeAt(aOther);
  float s1 = nd.w, s2 = od.w;
  if (s1 < -0.5 || s2 < -0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec3(0.0); vAlpha = 0.0; vT = 0.0; vPhase = 0.0; vSpeed = 0.0; vActive = 0.0; vHl = 0.0;
    return;
  }
  vec3 p = particlePos(nd.xyz, aOffset, aSeed, uTime);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 1.0);
  float mx = max(s1, s2);
  float mn = min(s1, s2);
  bool between = abs(aNode - aOther) > 0.5;          // Kante zwischen zwei Knoten
  float hl = between ? ((mx > 1.5 && mn > 0.5) ? 1.0 : 0.0) : (s1 > 0.5 ? 1.0 : 0.0);
  float fade = clamp(1.0 - (dist - uFogNear) / (uFogFar - uFogNear), 0.15, 1.0);
  float dim = mix(1.0, 0.05, uFocus * (1.0 - hl));
  vAlpha = aIntensity * fade * dim * (1.0 + 1.6 * hl) * uBrightness;
  vColor = aColor;
  vT = aT; vPhase = aPhase; vSpeed = aSpeed; vActive = aActive; vHl = hl;
  gl_Position = projectionMatrix * mv;
}
`;

export const LINES_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
varying vec3 vColor;
varying float vAlpha;
varying float vT;
varying float vPhase;
varying float vSpeed;
varying float vActive;
varying float vHl;

void main() {
  float cyc = fract(uTime * vSpeed + vPhase);
  float pos = cyc * 1.8 - 0.4;                      // Impuls wandert von Ende 0 nach Ende 1 und pausiert kurz
  float x = (vT - pos) * 7.0;
  float pulse = exp(-x * x) * vActive * uPulse;
  vec3 col = vColor * (0.5 + pulse * 3.0 + vHl * 0.6) + vec3(pulse * 0.25);
  gl_FragColor = vec4(col, vAlpha * (0.55 + pulse * 1.4));
}
`;
