import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const MeasureScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [290, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Plank slides in
  const plankX = interpolate(frame, [10, 50], [-700, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Ruler extends
  const rulerWidth = interpolate(frame, [55, 110], [0, 700], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Measurement labels appear
  const labelOpacity = interpolate(frame, [100, 125], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Pencil mark
  const markScale = interpolate(frame, [120, 140], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });

  // Step badge
  const badgeOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#1a1008", overflow: "hidden" }}>
      {/* Workshop floor texture */}
      <AbsoluteFill style={{
        background: "linear-gradient(180deg, #1a1008 0%, #0d0800 100%)",
      }} />
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 90% 50% at 50% 80%, rgba(220,160,60,0.12) 0%, transparent 60%)",
      }} />

      {/* Step badge */}
      <div style={{
        position: "absolute", top: 110, left: 60,
        opacity: badgeOpacity,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        letterSpacing: 1,
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>
        Schritt 1 📏
      </div>

      {/* Title */}
      <div style={{
        position: "absolute", top: 195, left: 60, right: 60,
        opacity: titleOpacity,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 64, fontWeight: 900, color: "#fff",
        lineHeight: 1.1,
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>
        Messen & Anzeichnen
      </div>

      {/* Workshop table */}
      <div style={{
        position: "absolute", bottom: 320, left: 0, right: 0,
        height: 40,
        background: "linear-gradient(180deg, #3d2a0f, #2a1d0a)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }} />

      {/* Wood plank */}
      <div style={{
        position: "absolute", bottom: 356, left: 60,
        translate: `${plankX}px 0`,
        width: 780, height: 100,
        borderRadius: 8,
        background: "linear-gradient(180deg, #DEB887 0%, #C4955A 40%, #A0784A 100%)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
        overflow: "hidden",
      }}>
        {/* Wood grain lines */}
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            position: "absolute", top: 12 + i * 18, left: 0, right: 0,
            height: 1, background: "rgba(100,60,10,0.25)",
          }} />
        ))}
      </div>

      {/* Ruler */}
      <div style={{
        position: "absolute", bottom: 470, left: 60,
        width: rulerWidth, height: 44,
        background: "linear-gradient(180deg, #F5E642, #D4C400)",
        borderRadius: "0 6px 6px 0",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: i * 18 + 4,
            bottom: 0, width: 1,
            height: i % 5 === 0 ? 24 : 12,
            background: "rgba(0,0,0,0.5)",
          }} />
        ))}
      </div>

      {/* 80cm label */}
      <div style={{
        position: "absolute", bottom: 525, left: 60,
        opacity: labelOpacity,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          background: "#FFE500", borderRadius: 10,
          padding: "8px 20px",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 42, fontWeight: 900, color: "#111",
        }}>
          80 cm
        </div>
        <div style={{ color: "#F4A460", fontSize: 34, fontWeight: 700 }}>Tiefe</div>
      </div>

      {/* Pencil mark */}
      <div style={{
        position: "absolute", bottom: 350, left: 790,
        scale: String(markScale),
        transformOrigin: "bottom center",
      }}>
        <div style={{ fontSize: 60 }}>✏️</div>
        <div style={{
          width: 3, height: 110, background: "#333",
          margin: "0 auto",
          borderRadius: 2,
        }} />
      </div>

      {/* Bottom tip */}
      <div style={{
        position: "absolute", bottom: 100, left: 60, right: 60,
        opacity: labelOpacity,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ color: "#F4A460", fontSize: 32, fontWeight: 700 }}>
          💡 Tipp: Immer zweimal messen!
        </div>
      </div>
    </AbsoluteFill>
  );
};
