import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const JarvisVideo = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(frame, [0, 30], [0.8, 1], { extrapolateRight: 'clamp' });
  const orbPulse = 1 + 0.05 * Math.sin((frame / 30) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at center, #0a1628 0%, #000810 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        fontFamily: 'monospace',
      }}
    >
      {/* Orb */}
      <div
        style={{
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #7ef8ff, #00b8d4 40%, #004d60 80%)',
          boxShadow: '0 0 60px #38d9ff, 0 0 120px #38d9ff55',
          transform: `scale(${orbPulse})`,
          opacity,
        }}
      />

      {/* Title */}
      <div
        style={{
          marginTop: 40,
          color: '#38d9ff',
          fontSize: 48,
          letterSpacing: 8,
          fontWeight: 'bold',
          textShadow: '0 0 20px #38d9ff',
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        JARVIS
      </div>

      <div
        style={{
          marginTop: 12,
          color: '#38d9ff99',
          fontSize: 18,
          letterSpacing: 4,
          opacity,
        }}
      >
        FUTURISTIC VOICE INTERFACE
      </div>
    </AbsoluteFill>
  );
};
