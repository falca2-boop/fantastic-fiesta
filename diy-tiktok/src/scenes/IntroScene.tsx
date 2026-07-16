import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [10, 35], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleY = interpolate(frame, [10, 35], [40, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const subOpacity = interpolate(frame, [30, 55], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const planksY = interpolate(frame, [0, 50], [120, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const exitOpacity = interpolate(frame, [75, 90], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#1a0f00", overflow: "hidden" }}>
      {/* Warm spotlight */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(200,120,30,0.25) 0%, transparent 70%)",
      }} />

      {/* Wood planks decorative */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        translate: `0px ${planksY}px`,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {[0.9, 0.75, 0.85, 0.7, 0.95].map((opacity, i) => (
          <div key={i} style={{
            height: 52, width: "100%",
            background: `rgba(${[139+i*8, 90-i*4, 43-i*3].join(",")}, ${opacity})`,
            borderTop: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "inset 0 -2px 8px rgba(0,0,0,0.4)",
          }} />
        ))}
      </div>

      {/* Center content */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 20 }}>
        {/* Emoji tool */}
        <div style={{
          fontSize: 100,
          opacity: titleOpacity,
          translate: `0px ${titleY}px`,
          filter: "drop-shadow(0 8px 24px rgba(255,120,0,0.4))",
        }}>
          🔨
        </div>

        <div style={{
          opacity: titleOpacity,
          translate: `0px ${titleY * 0.6}px`,
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: 88,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: -2,
            lineHeight: 1,
            textShadow: "0 4px 32px rgba(0,0,0,0.8)",
          }}>
            DIY
          </div>
          <div style={{
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: 52,
            fontWeight: 900,
            color: "#F4A460",
            letterSpacing: 1,
            textShadow: "0 4px 20px rgba(0,0,0,0.8)",
          }}>
            Regal aus Holz
          </div>
        </div>

        <div style={{
          opacity: subOpacity,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 50,
          padding: "10px 28px",
          border: "1px solid rgba(255,255,255,0.2)",
        }}>
          <span style={{ color: "#F4A460", fontWeight: 700, fontSize: 28 }}>
            In 60 Sekunden! ⚡
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
