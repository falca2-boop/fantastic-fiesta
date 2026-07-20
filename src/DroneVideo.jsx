import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

const ease = Easing.bezier(0.25, 0.1, 0.25, 1);

const Grid = ({ frame }) => {
  const lines = 20;
  const perspective = interpolate(frame, [0, 300], [800, 1200]);
  const rotateX = interpolate(frame, [0, 300], [55, 45]);
  const translateY = (frame * 1.5) % 60;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      perspective,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        width: '200%',
        height: '200%',
        left: '-50%',
        top: '-30%',
        transform: `rotateX(${rotateX}deg)`,
        transformOrigin: '50% 60%',
      }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={`h${i}`} style={{
            position: 'absolute',
            left: 0, right: 0,
            height: 1,
            top: `${((i / lines) * 100 + translateY / lines) % 100}%`,
            background: 'rgba(56,217,255,0.15)',
          }} />
        ))}
        {Array.from({ length: lines }).map((_, i) => (
          <div key={`v${i}`} style={{
            position: 'absolute',
            top: 0, bottom: 0,
            width: 1,
            left: `${(i / lines) * 100}%`,
            background: 'rgba(56,217,255,0.1)',
          }} />
        ))}
      </div>
    </div>
  );
};

const Scanline = ({ frame }) => {
  const y = (frame * 3) % 720;
  return (
    <div style={{
      position: 'absolute',
      left: 0, right: 0,
      top: y,
      height: 2,
      background: 'linear-gradient(90deg, transparent, rgba(56,217,255,0.4), transparent)',
      pointerEvents: 'none',
    }} />
  );
};

const HudCorner = ({ pos }) => {
  const size = 24;
  const style = {
    position: 'absolute',
    width: size, height: size,
    ...pos,
  };
  const borderStyle = '2px solid rgba(56,217,255,0.8)';
  const corners = {
    topLeft:    { borderTop: borderStyle, borderLeft: borderStyle, top: 0, left: 0 },
    topRight:   { borderTop: borderStyle, borderRight: borderStyle, top: 0, right: 0 },
    bottomLeft: { borderBottom: borderStyle, borderLeft: borderStyle, bottom: 0, left: 0 },
    bottomRight:{ borderBottom: borderStyle, borderRight: borderStyle, bottom: 0, right: 0 },
  };
  return (
    <div style={{ position: 'absolute', ...pos }}>
      {Object.values(corners).map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: size, height: size, ...s }} />
      ))}
    </div>
  );
};

const AltitudeMeter = ({ frame }) => {
  const alt = interpolate(frame, [0, 300], [0, 142], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', right: 48, top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      color: '#38d9ff', fontFamily: 'monospace', fontSize: 11,
    }}>
      <div style={{ opacity: 0.6 }}>ALT</div>
      <div style={{
        width: 4, height: 120,
        background: 'rgba(56,217,255,0.15)',
        border: '1px solid rgba(56,217,255,0.3)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: `${(alt / 200) * 100}%`,
          background: 'linear-gradient(to top, #38d9ff, rgba(56,217,255,0.3))',
        }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 'bold' }}>{Math.round(alt)}m</div>
    </div>
  );
};

export const DroneVideo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const fadeOut = interpolate(frame, [durationInFrames - 40, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', easing: ease });
  const masterOpacity = Math.min(fadeIn, fadeOut);

  // slow camera pan
  const panX = interpolate(frame, [0, durationInFrames], [0, -40]);
  const scale = interpolate(frame, [0, durationInFrames], [1.08, 1.0]);

  // title timing
  const titleOpacity = interpolate(frame, [40, 80, durationInFrames - 60, durationInFrames - 30], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [40, 80], [20, 0], { extrapolateRight: 'clamp', easing: ease });

  // subtitle
  const subOpacity = interpolate(frame, [70, 110], [0, 1], { extrapolateRight: 'clamp', easing: ease });

  // dates
  const datesOpacity = interpolate(frame, [100, 140], [0, 1], { extrapolateRight: 'clamp', easing: ease });

  // crosshair pulse
  const crossPulse = 0.5 + 0.5 * Math.sin((frame / 30) * Math.PI);

  // speed / coords
  const speed = interpolate(frame, [0, 150, 300], [0, 28, 18]);
  const lat = 48.1351 + frame * 0.000012;
  const lon = 11.5820 + frame * 0.000008;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden', opacity: masterOpacity }}>
      {/* Sky gradient background with pan */}
      <div style={{
        position: 'absolute', inset: -60,
        transform: `translateX(${panX}px) scale(${scale})`,
        background: 'linear-gradient(175deg, #0a1628 0%, #0d2240 30%, #1a3a5c 55%, #2d5a3d 75%, #3d7a4d 100%)',
      }}>
        {/* Horizon glow */}
        <div style={{
          position: 'absolute',
          top: '48%', left: '20%', right: '20%',
          height: 80,
          background: 'radial-gradient(ellipse, rgba(255,200,100,0.12) 0%, transparent 70%)',
          filter: 'blur(8px)',
        }} />
        {/* Terrain silhouette */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '38%',
          background: 'linear-gradient(to top, #1a2e1a, #2d4a2d88, transparent)',
          clipPath: 'polygon(0% 100%, 0% 60%, 5% 55%, 12% 58%, 18% 40%, 25% 45%, 32% 35%, 38% 42%, 45% 30%, 50% 38%, 55% 28%, 60% 35%, 67% 25%, 72% 32%, 78% 22%, 83% 30%, 88% 20%, 93% 28%, 100% 18%, 100% 100%)',
        }} />
        {/* Water reflection */}
        <div style={{
          position: 'absolute',
          bottom: '10%', left: '30%',
          width: '25%', height: '8%',
          background: 'rgba(56,180,255,0.08)',
          borderRadius: '50%',
          filter: 'blur(4px)',
        }} />
      </div>

      {/* Grid overlay */}
      <Grid frame={frame} />

      {/* Scanline */}
      <Scanline frame={frame} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)',
      }} />

      {/* HUD corners */}
      <HudCorner pos={{ top: 32, left: 32, width: 80, height: 80 }} />
      <HudCorner pos={{ top: 32, right: 32, width: 80, height: 80 }} />
      <HudCorner pos={{ bottom: 32, left: 32, width: 80, height: 80 }} />
      <HudCorner pos={{ bottom: 32, right: 32, width: 80, height: 80 }} />

      {/* Crosshair center */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
        <div style={{ position: 'relative', width: 60, height: 60, opacity: 0.3 + 0.2 * crossPulse }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#38d9ff' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#38d9ff' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, border: '1px solid #38d9ff', borderRadius: '50%' }} />
        </div>
      </div>

      {/* Altitude meter */}
      <AltitudeMeter frame={frame} />

      {/* Top HUD bar */}
      <div style={{
        position: 'absolute', top: 28, left: 80, right: 80,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: 'rgba(56,217,255,0.7)', fontFamily: 'monospace', fontSize: 11,
      }}>
        <div>
          <div style={{ fontSize: 9, opacity: 0.6 }}>KOORDINATEN</div>
          <div>{lat.toFixed(6)}°N  {lon.toFixed(6)}°E</div>
        </div>
        <div style={{ textAlign: 'center', opacity: 0.5, fontSize: 10 }}>
          ● REC  {String(Math.floor(frame / 1800)).padStart(2,'0')}:{String(Math.floor((frame % 1800) / 30)).padStart(2,'0')}:{String(frame % 30).padStart(2,'0')}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, opacity: 0.6 }}>SPEED</div>
          <div>{speed.toFixed(1)} km/h</div>
        </div>
      </div>

      {/* Main title */}
      <div style={{
        position: 'absolute', bottom: 160, left: 0, right: 0,
        textAlign: 'center',
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
      }}>
        <div style={{
          fontSize: 56, fontWeight: 900,
          fontFamily: 'Georgia, serif',
          color: '#fff',
          textShadow: '0 2px 40px rgba(0,0,0,0.8)',
          letterSpacing: 4,
        }}>
          Airbnb Unterkunft
        </div>
        <div style={{
          width: 80, height: 2,
          background: '#38d9ff',
          margin: '12px auto 0',
          boxShadow: '0 0 12px #38d9ff',
        }} />
      </div>

      {/* Subtitle / location */}
      <div style={{
        position: 'absolute', bottom: 115, left: 0, right: 0,
        textAlign: 'center',
        opacity: subOpacity,
        fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.8)',
        fontSize: 18,
        letterSpacing: 6,
      }}>
        DROHNENAUFNAHME
      </div>

      {/* Dates badge */}
      <div style={{
        position: 'absolute', bottom: 52, left: 0, right: 0,
        textAlign: 'center',
        opacity: datesOpacity,
        display: 'flex', justifyContent: 'center', gap: 0,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 16,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(56,217,255,0.3)',
          borderRadius: 4, padding: '8px 24px',
          color: '#fff', fontFamily: 'monospace', fontSize: 14,
        }}>
          <span style={{ color: '#38d9ff', fontSize: 11 }}>CHECK-IN</span>
          <span>28. Aug 2026</span>
          <span style={{ color: 'rgba(56,217,255,0.4)' }}>→</span>
          <span>30. Aug 2026</span>
          <span style={{ color: '#38d9ff', fontSize: 11 }}>CHECK-OUT</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
