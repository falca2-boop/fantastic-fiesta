import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const DrillScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [250, 280], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Drill rotation
  const drillRotate = interpolate(frame, [40, 280], [0, 3600], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Drill Y (pressing down)
  const drillY = interpolate(frame, [40, 70, 90, 115, 140, 165, 190, 215], [0, 80, 0, 80, 0, 80, 0, 80], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });

  // Holes appear
  const hole1 = interpolate(frame, [70, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hole2 = interpolate(frame, [115, 125], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hole3 = interpolate(frame, [160, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Sparkles / wood chips
  const chips = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const warningOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#0e0d14", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(80,60,180,0.15) 0%, transparent 60%)",
      }} />

      {/* Step badge */}
      <div style={{
        position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: 1,
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>
        Schritt 2 🔩
      </div>

      <div style={{
        position: "absolute", top: 195, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 64, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>
        Vorbohren!
      </div>

      {/* Plank on table */}
      <div style={{
        position: "absolute", bottom: 300, left: 80, right: 80, height: 110,
        borderRadius: 10,
        background: "linear-gradient(180deg, #DEB887, #A0784A)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
        overflow: "hidden",
      }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ position: "absolute", top: 10 + i * 20, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
        ))}
        {/* Holes */}
        {[{x: 180, o: hole1}, {x: 450, o: hole2}, {x: 720, o: hole3}].map(({x, o}, i) => (
          <div key={i} style={{
            position: "absolute", top: "50%", left: x,
            translate: "-50% -50%",
            width: 28 * o, height: 28 * o,
            borderRadius: "50%",
            background: "rgba(20,10,0,0.9)",
            boxShadow: `inset 0 2px 8px rgba(0,0,0,0.8)`,
          }} />
        ))}
      </div>

      {/* Drill */}
      <div style={{
        position: "absolute",
        bottom: 390 + (80 - drillY),
        left: "50%",
        translate: "-50% 0",
        textAlign: "center",
      }}>
        {/* Bit */}
        <div style={{
          width: 12, height: 80, margin: "0 auto",
          background: "linear-gradient(180deg, #888, #333)",
          borderRadius: "0 0 3px 3px",
          rotate: `${drillRotate}deg`,
          boxShadow: "0 0 8px rgba(100,150,255,0.3)",
        }} />
        {/* Body */}
        <div style={{
          width: 80, height: 120, margin: "0 auto",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40,
        }}>
          🔧
        </div>
      </div>

      {/* Wood chips */}
      {[{x: -30, y: -20},{x: 20, y: -35},{x: 40, y: -15}].map((pos, i) => (
        <div key={i} style={{
          position: "absolute",
          bottom: 415,
          left: "calc(50% + " + pos.x + "px)",
          opacity: chips * (i === 1 ? 0.9 : 0.7),
          translate: `0 ${-chips * Math.abs(pos.y)}px`,
          width: 8, height: 16,
          background: "#C4955A",
          borderRadius: 4,
          rotate: `${i * 30 - 20}deg`,
        }} />
      ))}

      {/* Warning tip */}
      <div style={{
        position: "absolute", bottom: 100, left: 60, right: 60,
        opacity: warningOpacity,
        background: "rgba(255,87,34,0.15)",
        borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,87,34,0.3)",
      }}>
        <div style={{ color: "#FF6B35", fontSize: 30, fontWeight: 700 }}>
          ⚠️ Vorbohren = kein Holzriss!
        </div>
      </div>
    </AbsoluteFill>
  );
};
