import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const shelfScale = interpolate(frame, [10, 50], [0.6, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.3, 0.64, 1),
  });
  const shelfOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const fertigOpacity = interpolate(frame, [50, 75], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const ctaOpacity = interpolate(frame, [100, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Both people celebrate — arms go up
  const celebArm = interpolate(frame, [50, 80, 100, 130, 150, 180], [-80, -20, -80, -20, -80, -20], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.5, 0.64, 1),
  });
  // Jump bounce
  const jumpY = interpolate(frame, [55, 70, 85, 105, 120, 135, 150, 165], [0, -40, 0, -40, 0, -40, 0, -40], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.5, 0.64, 1),
  });

  const confettiProgress = interpolate(frame, [70, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const confetti = [
    { x: 100, y: 400, color: "#FFE500", size: 18 },
    { x: 900, y: 350, color: "#FF6B35", size: 14 },
    { x: 180, y: 900, color: "#4ade80", size: 22 },
    { x: 850, y: 800, color: "#60a5fa", size: 16 },
    { x: 500, y: 250, color: "#f472b6", size: 20 },
    { x: 280, y: 1500, color: "#FFE500", size: 12 },
    { x: 750, y: 1400, color: "#FF6B35", size: 18 },
    { x: 80, y: 1200, color: "#4ade80", size: 14 },
    { x: 980, y: 1100, color: "#60a5fa", size: 22 },
    { x: 400, y: 600, color: "#f472b6", size: 10 },
    { x: 650, y: 500, color: "#FFE500", size: 16 },
  ];

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #0a1a0a 0%, #050d05 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(200,160,40,0.18) 0%, transparent 65%)",
      }} />

      {/* Confetti */}
      {confetti.map((c, i) => (
        <div key={i} style={{
          position: "absolute", left: c.x, top: c.y - confettiProgress * (250 + i * 50),
          width: c.size, height: c.size, borderRadius: "50%",
          background: c.color, opacity: confettiProgress * 0.85,
          rotate: `${confettiProgress * (i % 2 === 0 ? 360 : -360)}deg`,
        }} />
      ))}

      {/* Floor */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 210,
        background: "linear-gradient(180deg, #1a2a0a, #0a1a05)",
        borderTop: "2px solid rgba(255,255,255,0.05)",
      }} />

      {/* FERTIG! title */}
      <div style={{
        position: "absolute", top: 110, left: "50%", translate: "-50% 0",
        opacity: fertigOpacity, textAlign: "center", whiteSpace: "nowrap",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 96, fontWeight: 900, color: "#FFE500",
        textShadow: "0 0 40px rgba(255,229,0,0.5), 0 4px 20px rgba(0,0,0,0.9)",
        letterSpacing: -2,
      }}>
        FERTIG! 🎉
      </div>

      {/* Finished shelf */}
      <div style={{
        position: "absolute", top: 310, left: "50%", translate: "-50% 0",
        scale: String(shelfScale), opacity: shelfOpacity, width: 480,
      }}>
        {[0, 530].map(x => (
          <div key={x} style={{
            position: "absolute", left: x === 0 ? 0 : 425, top: 0,
            width: 55, height: 360,
            background: "linear-gradient(180deg, #DEB887, #A0784A)",
            borderRadius: 7,
            boxShadow: "4px 0 16px rgba(0,0,0,0.3)",
          }} />
        ))}
        {[0, 120, 255, 340].map((y, i) => (
          <div key={i} style={{
            position: "absolute", left: 55, right: 55, top: y, height: 44,
            background: "linear-gradient(180deg, #DEB887, #A0784A)",
            boxShadow: "0 5px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}>
            {i === 1 && <span style={{ position: "absolute", left: 18, top: 6, fontSize: 24 }}>📚</span>}
            {i === 1 && <span style={{ position: "absolute", left: 80, top: 6, fontSize: 22 }}>🌱</span>}
            {i === 2 && <span style={{ position: "absolute", left: 28, top: 4, fontSize: 26 }}>🏺</span>}
          </div>
        ))}
      </div>

      {/* Person 1 — left, celebrating */}
      <div style={{ position: "absolute", bottom: 200 + jumpY, left: 30 }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={celebArm} rightArmAngle={celebArm}
          leftForearmAngle={-15} rightForearmAngle={-15}
          leftLegAngle={20} rightLegAngle={-20}
          scale={1.5}
        />
      </div>

      {/* Person 2 — right, celebrating */}
      <div style={{ position: "absolute", bottom: 200 + jumpY * 0.85, right: 20 }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={celebArm} rightArmAngle={celebArm}
          leftForearmAngle={-15} rightForearmAngle={-15}
          leftLegAngle={-20} rightLegAngle={20}
          flip scale={1.5}
        />
      </div>

      {/* CTA */}
      <div style={{
        position: "absolute", bottom: 80, left: 60, right: 60,
        opacity: ctaOpacity, display: "flex", flexDirection: "column", gap: 14, alignItems: "center",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
          borderRadius: 50, padding: "18px 48px",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 38, fontWeight: 900, color: "#fff",
          boxShadow: "0 8px 32px rgba(255,63,0,0.5)",
          textAlign: "center",
        }}>
          👍 Like & Folgen!
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 26, textAlign: "center" }}>
          Mehr DIY Projekte kommen! 🔨
        </div>
      </div>
    </AbsoluteFill>
  );
};
