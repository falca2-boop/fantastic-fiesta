import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

const ease = Easing.bezier(0.25, 0.1, 0.25, 1);
const easeOut = Easing.bezier(0, 0, 0.2, 1);

const W = 1080;
const H = 1920;

/* ── Haussmann building facade ── */
const Building = ({ x, y, w, h, floors, windows, color }) => {
  const floorH = h / (floors + 1);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={color} />
      {/* Roof line */}
      <rect x={x} y={y} width={w} height={6} fill="rgba(0,0,0,0.15)" />
      {/* Windows */}
      {Array.from({ length: floors }).map((_, fi) =>
        Array.from({ length: windows }).map((_, wi) => {
          const wx = x + (wi + 0.5) * (w / windows) - 10;
          const wy = y + floorH * (fi + 0.7);
          return (
            <g key={`${fi}-${wi}`}>
              <rect x={wx} y={wy} width={20} height={28} fill="rgba(135,180,220,0.6)" rx={1} />
              <rect x={wx} y={wy} width={20} height={28} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={1} rx={1} />
              <line x1={wx + 10} y1={wy} x2={wx + 10} y2={wy + 28} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
              <line x1={wx} y1={wy + 14} x2={wx + 20} y2={wy + 14} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
            </g>
          );
        })
      )}
      {/* Mansard roof */}
      <rect x={x} y={y - 28} width={w} height={30} fill={color} />
      <rect x={x} y={y - 28} width={w} height={4} fill="rgba(80,80,80,0.4)" />
    </g>
  );
};

/* ── Balcony railing (SVG ornamental) ── */
const Railing = ({ x, y, w }) => {
  const posts = Math.floor(w / 38);
  return (
    <g>
      <rect x={x} y={y} width={w} height={8} fill="#1a1a1a" rx={2} />
      <rect x={x} y={y + 60} width={w} height={8} fill="#1a1a1a" rx={2} />
      {Array.from({ length: posts }).map((_, i) => {
        const px = x + i * 38 + 12;
        return (
          <g key={i}>
            <rect x={px} y={y + 8} width={4} height={52} fill="#1a1a1a" />
            {/* Heart ornament */}
            <circle cx={px + 2} cy={y + 26} r={7} fill="none" stroke="#1a1a1a" strokeWidth={3} />
            <circle cx={px - 2} cy={y + 26} r={7} fill="none" stroke="#1a1a1a" strokeWidth={3} />
          </g>
        );
      })}
    </g>
  );
};

export const ParisVideo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn  = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const fadeOut = interpolate(frame, [durationInFrames - 35, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const master  = Math.min(fadeIn, fadeOut);

  // slow upward drone rise + slight zoom
  const droneY  = interpolate(frame, [0, durationInFrames], [60, -80]);
  const droneS  = interpolate(frame, [0, durationInFrames], [1.12, 1.0]);

  // golden hour light pulse
  const sunPulse = 0.7 + 0.06 * Math.sin((frame / 90) * Math.PI);

  // text timings
  const t = (a, b) => interpolate(frame, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const tagOp   = t(30, 65);
  const cityOp  = t(60, 100);
  const cityY   = interpolate(frame, [60, 100], [28, 0], { extrapolateRight: 'clamp', easing: easeOut });
  const subOp   = t(100, 135);
  const datesOp = t(145, 180);
  const ctaOp   = t(200, 240);
  const ctaS    = interpolate(frame, [200, 240], [0.88, 1], { extrapolateRight: 'clamp', easing: easeOut });

  // HUD blink
  const recBlink = frame % 60 < 40 ? 1 : 0;
  const lat = 48.8566 + frame * 0.000008;
  const lon = 2.3522  + frame * 0.000005;
  const alt = interpolate(frame, [0, durationInFrames], [38, 112]);
  const spd = interpolate(frame, [0, 120, 300], [0, 24, 16]);

  return (
    <AbsoluteFill style={{ background: '#1a1008', overflow: 'hidden', opacity: master }}>

      {/* ── Scene: Paris rooftops (SVG) ── */}
      <div style={{
        position: 'absolute', inset: -80,
        transform: `translateY(${droneY}px) scale(${droneS})`,
      }}>
        <svg width={W + 160} height={H + 160} viewBox={`0 0 ${W + 160} ${H + 160}`} style={{ position: 'absolute', inset: 0 }}>
          {/* Sky gradient */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#4a90d9" />
              <stop offset="45%"  stopColor="#87ceeb" />
              <stop offset="70%"  stopColor={`rgba(255,${Math.round(200 * sunPulse)},80,0.9)`} />
              <stop offset="100%" stopColor="#f5e6d0" />
            </linearGradient>
            <radialGradient id="sun" cx="60%" cy="38%" r="20%">
              <stop offset="0%"  stopColor={`rgba(255,240,180,${0.5 * sunPulse})`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#3d3020" />
              <stop offset="100%" stopColor="#1a1008" />
            </linearGradient>
          </defs>

          {/* Sky */}
          <rect width={W + 160} height={H + 160} fill="url(#sky)" />
          {/* Sun glow */}
          <rect width={W + 160} height={H + 160} fill="url(#sun)" />

          {/* Back row buildings */}
          <Building x={-20}  y={520} w={180} h={520} floors={5} windows={3} color="#e8ddd0" />
          <Building x={155}  y={480} w={220} h={560} floors={6} windows={3} color="#f0e8dc" />
          <Building x={370}  y={500} w={190} h={540} floors={5} windows={3} color="#ebe0d4" />
          <Building x={555}  y={460} w={240} h={580} floors={6} windows={4} color="#e6dbd0" />
          <Building x={790}  y={490} w={200} h={550} floors={5} windows={3} color="#ede3d7" />
          <Building x={985}  y={470} w={195} h={570} floors={6} windows={3} color="#f0e5d9" />

          {/* Mid row buildings (more detail) */}
          <Building x={-10}  y={700} w={160} h={650} floors={5} windows={2} color="#d8cfc4" />
          <Building x={145}  y={680} w={200} h={670} floors={6} windows={3} color="#ddd4c8" />
          <Building x={340}  y={660} w={180} h={690} floors={6} windows={3} color="#d6cdc2" />
          <Building x={515}  y={650} w={220} h={700} floors={7} windows={3} color="#dbd2c7" />
          <Building x={730}  y={670} w={190} h={680} floors={6} windows={3} color="#d9d0c5" />
          <Building x={915}  y={655} w={200} h={695} floors={6} windows={3} color="#ddd4c9" />

          {/* Street level */}
          <rect x={0} y={1200} width={W + 160} height={360} fill="url(#ground)" />

          {/* Balcony floor */}
          <rect x={0} y={1430} width={W + 160} height={40} fill="#2a2018" />
          <rect x={0} y={1430} width={W + 160} height={8} fill="rgba(255,200,100,0.12)" />

          {/* Table */}
          <ellipse cx={540} cy={1490} rx={90} ry={18} fill="#d8d0c8" />
          <ellipse cx={540} cy={1488} rx={88} ry={16} fill="#e8e0d8" />
          <rect x={534} y={1505} width={12} height={60} fill="#b0a898" />
          <ellipse cx={540} cy={1568} rx={28} ry={6} fill="#9a9080" />

          {/* Fruit bowl */}
          <ellipse cx={540} cy={1474} rx={38} ry={12} fill="#f0ece8" />
          <circle cx={528} cy={1468} r={10} fill="#e8a070" />
          <circle cx={542} cy={1465} r={11} fill="#d89060" />
          <circle cx={556} cy={1469} r={10} fill="#e8a070" />

          {/* Chair left */}
          <rect x={430} y={1455} width={60} height={8} fill="#e8e0d8" rx={2} />
          <rect x={435} y={1463} width={8} height={50} fill="#c0b8b0" />
          <rect x={478} y={1463} width={8} height={50} fill="#c0b8b0" />
          <rect x={435} y={1400} width={50} height={55} fill="#e8e0d8" rx={2} />

          {/* Chair right */}
          <rect x={650} y={1455} width={60} height={8} fill="#e8e0d8" rx={2} />
          <rect x={655} y={1463} width={8} height={50} fill="#c0b8b0" />
          <rect x={698} y={1463} width={8} height={50} fill="#c0b8b0" />
          <rect x={652} y={1410} width={50} height={45} fill="#e8e0d8" rx={2} />

          {/* Railing */}
          <Railing x={0} y={1540} w={W + 160} />

          {/* Shadow / depth at bottom */}
          <rect x={0} y={1600} width={W + 160} height={160} fill="rgba(0,0,0,0.5)" />

          {/* Warm sunlight overlay */}
          <rect x={0} y={0} width={W + 160} height={H + 160}
            fill={`rgba(255,200,80,${0.06 * sunPulse})`} />
        </svg>
      </div>

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 85% 100% at 50% 50%, transparent 25%, rgba(0,0,0,0.72) 100%)',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 260,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 480,
        background: 'linear-gradient(to top, rgba(0,0,0,0.88), transparent)',
      }} />

      {/* ── HUD corners ── */}
      {[
        { top: 52, left: 52 }, { top: 52, right: 52 },
        { bottom: 52, left: 52 }, { bottom: 52, right: 52 },
      ].map((pos, i) => {
        const b = '2.5px solid rgba(255,200,80,0.7)';
        const corners = [
          { top: 0, left: 0, borderTop: b, borderLeft: b },
          { top: 0, right: 0, borderTop: b, borderRight: b },
          { bottom: 0, left: 0, borderBottom: b, borderLeft: b },
          { bottom: 0, right: 0, borderBottom: b, borderRight: b },
        ];
        return (
          <div key={i} style={{ position: 'absolute', width: 88, height: 88, ...pos }}>
            {corners.map((s, j) => (
              <div key={j} style={{ position: 'absolute', width: 28, height: 28, ...s }} />
            ))}
          </div>
        );
      })}

      {/* ── Top HUD bar ── */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between',
        padding: '0 110px',
        color: 'rgba(255,220,120,0.8)',
        fontFamily: 'monospace', fontSize: 22,
      }}>
        <div>
          <div style={{ fontSize: 15, opacity: 0.6, marginBottom: 3 }}>POSITION</div>
          <div>{lat.toFixed(5)}°N</div>
          <div>{lon.toFixed(5)}°E</div>
        </div>
        <div style={{ textAlign: 'center', opacity: recBlink }}>
          <div style={{ color: '#ff4444', fontSize: 15, marginBottom: 3 }}>● REC</div>
          <div style={{ fontSize: 20 }}>
            00:{String(Math.floor(frame / 30)).padStart(2,'0')}:{String(frame % 30).padStart(2,'0')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, opacity: 0.6, marginBottom: 3 }}>ALT / SPD</div>
          <div>{Math.round(alt)} m</div>
          <div>{spd.toFixed(1)} km/h</div>
        </div>
      </div>

      {/* ── Crosshair ── */}
      <div style={{
        position: 'absolute', top: '46%', left: '50%',
        transform: 'translate(-50%,-50%)',
        opacity: 0.35 + 0.2 * Math.sin((frame / 30) * Math.PI),
      }}>
        {[[-40,0,80,1],[0,-40,1,80]].map(([x,y,w,h],i) => (
          <div key={i} style={{
            position: 'absolute', left: x, top: y,
            width: w, height: h,
            background: 'rgba(255,220,120,0.7)',
          }} />
        ))}
        <div style={{
          position: 'absolute', top: -8, left: -8, width: 16, height: 16,
          border: '1.5px solid rgba(255,220,120,0.7)', borderRadius: '50%',
        }} />
      </div>

      {/* ── Bottom content ── */}
      <div style={{
        position: 'absolute', bottom: 90, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
        padding: '0 56px',
      }}>
        {/* CTA */}
        <div style={{
          opacity: ctaOp, transform: `scale(${ctaS})`,
          background: 'rgba(255,180,40,0.18)',
          border: '1.5px solid rgba(255,200,80,0.75)',
          borderRadius: 50, padding: '18px 60px',
          color: '#ffd060',
          fontFamily: 'monospace', fontSize: 28, letterSpacing: 4,
          boxShadow: '0 0 32px rgba(255,200,80,0.2)',
        }}>
          JETZT BUCHEN
        </div>

        {/* Dates */}
        <div style={{
          opacity: datesOp,
          display: 'flex', alignItems: 'center', gap: 22,
          background: 'rgba(0,0,0,0.52)',
          border: '1px solid rgba(255,200,80,0.28)',
          borderRadius: 8, padding: '16px 36px',
          color: '#fff', fontFamily: 'monospace', fontSize: 27,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#ffc840', fontSize: 17, marginBottom: 5 }}>CHECK-IN</div>
            <div>28. Aug 2026</div>
          </div>
          <div style={{ color: 'rgba(255,200,80,0.45)', fontSize: 34, margin: '0 4px' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#ffc840', fontSize: 17, marginBottom: 5 }}>CHECK-OUT</div>
            <div>30. Aug 2026</div>
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          opacity: subOp,
          color: 'rgba(255,240,200,0.75)',
          fontFamily: 'monospace', fontSize: 26, letterSpacing: 8,
        }}>
          DROHNENAUFNAHME
        </div>

        {/* City title */}
        <div style={{
          opacity: cityOp,
          transform: `translateY(${cityY}px)`,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 80, fontWeight: 900,
            fontFamily: 'Georgia, serif',
            color: '#fff',
            textShadow: '0 4px 50px rgba(0,0,0,0.95)',
            letterSpacing: 5,
          }}>
            Paris
          </div>
          <div style={{
            fontSize: 26, color: 'rgba(255,220,140,0.8)',
            fontFamily: 'monospace', letterSpacing: 6, marginTop: 6,
          }}>
            FRANKREICH
          </div>
          <div style={{
            width: 90, height: 3,
            background: 'linear-gradient(90deg, transparent, #ffc840, transparent)',
            margin: '14px auto 0',
            boxShadow: '0 0 16px rgba(255,200,80,0.6)',
          }} />
        </div>

        {/* Hashtag */}
        <div style={{
          opacity: tagOp,
          background: 'rgba(255,200,80,0.12)',
          border: '1px solid rgba(255,200,80,0.35)',
          borderRadius: 4, padding: '8px 24px',
          color: '#ffc840', fontFamily: 'monospace', fontSize: 22, letterSpacing: 3,
        }}>
          #PARIS · #AIRBNB · #TRAVEL
        </div>
      </div>

    </AbsoluteFill>
  );
};
