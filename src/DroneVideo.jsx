import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

const ease = Easing.bezier(0.25, 0.1, 0.25, 1);

const Grid = ({ frame }) => {
  const lines = 16;
  const translateY = (frame * 1.5) % 80;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={`h${i}`} style={{
          position: 'absolute', left: 0, right: 0, height: 1,
          top: `${((i / lines) * 100 + translateY / lines) % 100}%`,
          background: 'rgba(56,217,255,0.12)',
        }} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`v${i}`} style={{
          position: 'absolute', top: 0, bottom: 0, width: 1,
          left: `${(i / 8) * 100}%`,
          background: 'rgba(56,217,255,0.08)',
        }} />
      ))}
    </div>
  );
};

const Scanline = ({ frame }) => {
  const y = (frame * 5) % 1920;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: y, height: 3,
      background: 'linear-gradient(90deg, transparent, rgba(56,217,255,0.35), transparent)',
    }} />
  );
};

const HudCorner = ({ top, right, bottom, left }) => {
  const size = 32;
  const b = '2px solid rgba(56,217,255,0.8)';
  const corners = [
    { top: 0, left: 0, borderTop: b, borderLeft: b },
    { top: 0, right: 0, borderTop: b, borderRight: b },
    { bottom: 0, left: 0, borderBottom: b, borderLeft: b },
    { bottom: 0, right: 0, borderBottom: b, borderRight: b },
  ];
  return (
    <div style={{ position: 'absolute', top, right, bottom, left, width: 80, height: 80 }}>
      {corners.map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: size, height: size, ...s }} />
      ))}
    </div>
  );
};

export const DroneVideo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn  = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const fadeOut = interpolate(frame, [durationInFrames - 40, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', easing: ease });
  const masterOpacity = Math.min(fadeIn, fadeOut);

  // slow aerial pan — vertical scroll feel
  const panY = interpolate(frame, [0, durationInFrames], [0, -60]);
  const scale = interpolate(frame, [0, durationInFrames], [1.1, 1.0]);

  // text timings
  const tagOpacity   = interpolate(frame, [30,  60],  [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const titleOpacity = interpolate(frame, [60,  100], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const titleY       = interpolate(frame, [60,  100], [30, 0], { extrapolateRight: 'clamp', easing: ease });
  const subOpacity   = interpolate(frame, [100, 135], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const datesOpacity = interpolate(frame, [140, 175], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const ctaOpacity   = interpolate(frame, [190, 230], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const ctaScale     = interpolate(frame, [190, 230], [0.85, 1], { extrapolateRight: 'clamp', easing: ease });

  const crossPulse = 0.4 + 0.35 * Math.sin((frame / 25) * Math.PI);

  const speed = interpolate(frame, [0, 150, 300], [0, 32, 22]);
  const alt   = interpolate(frame, [0, 300], [0, 185], { extrapolateRight: 'clamp' });
  const lat   = 48.1351 + frame * 0.000012;
  const lon   = 11.5820 + frame * 0.000008;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden', opacity: masterOpacity }}>

      {/* Background landscape — vertical crop */}
      <div style={{
        position: 'absolute', inset: -80,
        transform: `translateY(${panY}px) scale(${scale})`,
        background: 'linear-gradient(180deg, #06101e 0%, #0d2240 20%, #1a3a5c 42%, #1e4a38 65%, #2d6a44 85%, #1a3a20 100%)',
      }}>
        {/* Sun glow */}
        <div style={{
          position: 'absolute', top: '22%', left: '50%',
          transform: 'translateX(-50%)',
          width: 320, height: 160,
          background: 'radial-gradient(ellipse, rgba(255,200,80,0.18) 0%, transparent 70%)',
          filter: 'blur(12px)',
        }} />
        {/* Horizon line */}
        <div style={{
          position: 'absolute', top: '42%', left: 0, right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,200,80,0.15), transparent)',
        }} />
        {/* Terrain silhouette */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
          background: 'linear-gradient(to top, #182818, #2d4a2d88, transparent)',
          clipPath: 'polygon(0% 100%, 0% 70%, 8% 60%, 16% 65%, 22% 48%, 30% 55%, 36% 40%, 43% 50%, 50% 35%, 57% 45%, 63% 32%, 70% 42%, 76% 28%, 82% 38%, 88% 22%, 94% 32%, 100% 20%, 100% 100%)',
        }} />
        {/* Lake */}
        <div style={{
          position: 'absolute', bottom: '18%', left: '25%',
          width: '30%', height: '6%',
          background: 'rgba(56,160,255,0.1)',
          borderRadius: '50%',
          filter: 'blur(6px)',
        }} />
      </div>

      <Grid frame={frame} />
      <Scanline frame={frame} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 100% at 50% 50%, transparent 30%, rgba(0,0,0,0.8) 100%)',
      }} />
      {/* Top darken */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 220,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
      }} />
      {/* Bottom darken */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 400,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
      }} />

      {/* HUD corners */}
      <HudCorner top={48} left={48} />
      <HudCorner top={48} right={48} />
      <HudCorner bottom={48} left={48} />
      <HudCorner bottom={48} right={48} />

      {/* Top HUD */}
      <div style={{
        position: 'absolute', top: 52, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '0 100px',
        color: 'rgba(56,217,255,0.75)', fontFamily: 'monospace', fontSize: 22,
      }}>
        <div>
          <div style={{ fontSize: 16, opacity: 0.6, marginBottom: 2 }}>LAT / LON</div>
          <div>{lat.toFixed(5)}°N</div>
          <div>{lon.toFixed(5)}°E</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, opacity: 0.5, marginBottom: 2 }}>● REC</div>
          <div style={{ fontSize: 20 }}>
            {String(Math.floor(frame / 1800)).padStart(2,'0')}:
            {String(Math.floor((frame % 1800) / 30)).padStart(2,'0')}:
            {String(frame % 30).padStart(2,'0')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, opacity: 0.6, marginBottom: 2 }}>ALT / SPD</div>
          <div>{Math.round(alt)} m</div>
          <div>{speed.toFixed(1)} km/h</div>
        </div>
      </div>

      {/* Center crosshair */}
      <div style={{
        position: 'absolute', top: '42%', left: '50%',
        transform: 'translate(-50%,-50%)',
        opacity: crossPulse,
      }}>
        <div style={{ position: 'relative', width: 80, height: 80 }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#38d9ff' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#38d9ff' }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 14, height: 14,
            border: '1.5px solid #38d9ff', borderRadius: '50%',
          }} />
        </div>
      </div>

      {/* Bottom content block */}
      <div style={{
        position: 'absolute', bottom: 100, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        padding: '0 60px',
      }}>

        {/* CTA Button */}
        <div style={{
          opacity: ctaOpacity,
          transform: `scale(${ctaScale})`,
          background: 'linear-gradient(135deg, #38d9ff22, #38d9ff44)',
          border: '1.5px solid #38d9ff',
          borderRadius: 50,
          padding: '18px 56px',
          color: '#38d9ff',
          fontFamily: 'monospace',
          fontSize: 26,
          letterSpacing: 3,
          boxShadow: '0 0 30px rgba(56,217,255,0.25)',
        }}>
          JETZT BUCHEN
        </div>

        {/* Dates */}
        <div style={{
          opacity: datesOpacity,
          display: 'flex', alignItems: 'center', gap: 20,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(56,217,255,0.25)',
          borderRadius: 6, padding: '16px 36px',
          color: '#fff', fontFamily: 'monospace', fontSize: 26,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#38d9ff', fontSize: 18, marginBottom: 4 }}>CHECK-IN</div>
            <div>28. Aug 2026</div>
          </div>
          <div style={{ color: 'rgba(56,217,255,0.4)', fontSize: 32 }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#38d9ff', fontSize: 18, marginBottom: 4 }}>CHECK-OUT</div>
            <div>30. Aug 2026</div>
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          opacity: subOpacity,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'monospace',
          fontSize: 26,
          letterSpacing: 8,
          textAlign: 'center',
        }}>
          DROHNENAUFNAHME
        </div>

        {/* Title */}
        <div style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 72, fontWeight: 900,
            fontFamily: 'Georgia, serif',
            color: '#fff',
            textShadow: '0 4px 40px rgba(0,0,0,0.9)',
            letterSpacing: 3,
            lineHeight: 1.1,
          }}>
            Airbnb{'\n'}Unterkunft
          </div>
          <div style={{
            width: 80, height: 3,
            background: '#38d9ff',
            margin: '16px auto 0',
            boxShadow: '0 0 16px #38d9ff',
          }} />
        </div>

        {/* Tag */}
        <div style={{
          opacity: tagOpacity,
          background: 'rgba(56,217,255,0.15)',
          border: '1px solid rgba(56,217,255,0.4)',
          borderRadius: 4,
          padding: '8px 24px',
          color: '#38d9ff',
          fontFamily: 'monospace',
          fontSize: 22,
          letterSpacing: 4,
        }}>
          #AIRBNB · #DROHNE · #TRAVEL
        </div>

      </div>

    </AbsoluteFill>
  );
};
