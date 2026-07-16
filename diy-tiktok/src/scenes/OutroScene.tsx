import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const shelfScale = interpolate(frame, [10, 50], [0.6, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.3, 0.64, 1),
  });
  const shelfOpacity = interpolate(frame, [10, 40], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const fertigOpacity = interpolate(frame, [50, 75], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fertigScale = interpolate(frame, [50, 75], [0.7, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.3, 0.64, 1),
  });

  // Stars burst
  const starScale = interpolate(frame, [70, 95], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.5, 0.64, 1),
  });

  const ctaOpacity = interpolate(frame, [100, 130], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Confetti-like dots
  const confettiProgress = interpolate(frame, [70, 240], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const confetti = [
    { x: 120, y: 300, color: "#FFE500", size: 16 },
    { x: 860, y: 250, color: "#FF6B35", size: 12 },
    { x: 200, y: 800, color: "#4ade80", size: 20 },
    { x: 800, y: 700, color: "#60a5fa", size: 14 },
    { x: 480, y: 200, color: "#f472b6", size: 18 },
    { x: 320, y: 1400, color: "#FFE500", size: 10 },
    { x: 700, y: 1300, color: "#FF6B35", size: 16 },
    { x: 100, y: 1100, color: "#4ade80", size: 12 },
    { x: 950, y: 1000, color: "#60a5fa", size: 20 },
  ];

  return (
    <AbsoluteFill style={{ background: "#0a1a0a", overflow: "hidden" }}>
      {/* Warm spotlight */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(200,160,40,0.2) 0%, transparent 65%)",
      }} />

      {/* Confetti dots */}
      {confetti.map((c, i) => (
        <div key={i} style={{
          position: "absolute", left: c.x, top: c.y - confettiProgress * (200 + i * 40),
          width: c.size, height: c.size, borderRadius: "50%",
          background: c.color,
          opacity: confettiProgress * 0.8,
          rotate: `${confettiProgress * (i % 2 === 0 ? 360 : -360)}deg`,
        }} />
      ))}

      {/* Finished shelf */}
      <div style={{
        position: "absolute", top: 280, left: "50%",
        translate: "-50% 0",
        scale: String(shelfScale),
        opacity: shelfOpacity,
        width: 600,
      }}>
        {/* Full assembled shelf */}
        <div style={{
          width: 600, height: 420,
          position: "relative",
        }}>
          {/* Side panels */}
          {[0, 530].map(x => (
            <div key={x} style={{
              position: "absolute", left: x, top: 0,
              width: 70, height: 420,
              background: "linear-gradient(180deg, #DEB887, #A0784A)",
              borderRadius: 8,
              boxShadow: "4px 0 16px rgba(0,0,0,0.3), inset 1px 0 0 rgba(255,255,255,0.15)",
            }} />
          ))}
          {/* Shelves */}
          {[0, 140, 280, 370].map((y, i) => (
            <div key={i} style={{
              position: "absolute", left: 70, right: 70, top: y,
              height: 50,
              background: "linear-gradient(180deg, #DEB887, #A0784A)",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
              // Lacquer sheen
              backgroundImage: "linear-gradient(180deg, #DEB887, #A0784A), linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)",
            }}>
              {/* Items on shelves */}
              {i === 1 && <div style={{ position: "absolute", left: 20, top: 5, fontSize: 28 }}>📚</div>}
              {i === 1 && <div style={{ position: "absolute", left: 90, top: 5, fontSize: 24 }}>🌱</div>}
              {i === 2 && <div style={{ position: "absolute", left: 30, top: 2, fontSize: 30 }}>🏺</div>}
            </div>
          ))}
        </div>
      </div>

      {/* FERTIG! */}
      <div style={{
        position: "absolute", top: 180, left: "50%",
        translate: "-50% 0",
        opacity: fertigOpacity,
        scale: String(fertigScale),
        textAlign: "center",
        whiteSpace: "nowrap",
      }}>
        <div style={{
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 96, fontWeight: 900,
          color: "#FFE500",
          textShadow: "0 0 40px rgba(255,229,0,0.5), 0 4px 20px rgba(0,0,0,0.8)",
          letterSpacing: -2,
        }}>
          FERTIG! 🎉
        </div>
      </div>

      {/* Stars */}
      {[{x: 160, y: 230},{x: 880, y: 190},{x: 520, y: 140}].map((pos, i) => (
        <div key={i} style={{
          position: "absolute", left: pos.x, top: pos.y,
          fontSize: 40,
          scale: String(starScale * (0.8 + i * 0.15)),
          opacity: starScale,
        }}>
          ⭐
        </div>
      ))}

      {/* CTA */}
      <div style={{
        position: "absolute", bottom: 120, left: 60, right: 60,
        opacity: ctaOpacity,
        display: "flex", flexDirection: "column", gap: 16, alignItems: "center",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
          borderRadius: 50, padding: "18px 48px",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 40, fontWeight: 900, color: "#fff",
          boxShadow: "0 8px 32px rgba(255,63,0,0.5)",
          textAlign: "center",
        }}>
          👍 Like & Folgen!
        </div>
        <div style={{
          color: "rgba(255,255,255,0.7)", fontSize: 28, textAlign: "center",
        }}>
          Mehr DIY Projekte kommen! 🔨
        </div>
      </div>
    </AbsoluteFill>
  );
};
