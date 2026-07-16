import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const MeasureScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [300, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Plank slides in
  const plankX = interpolate(frame, [10, 55], [-900, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Ruler extends
  const rulerWidth = interpolate(frame, [60, 120], [0, 680], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  const labelOpacity = interpolate(frame, [110, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Person 1 bends forward to hold the plank
  const p1Lean = interpolate(frame, [20, 50], [0, -18], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });
  // Person 2 arm holds ruler
  const p2ArmAngle = interpolate(frame, [60, 100], [20, -55], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "linear-gradient(180deg, #1a1008 0%, #0d0800 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 80% 50% at 50% 80%, rgba(220,160,60,0.14) 0%, transparent 60%)",
      }} />

      {/* Workshop floor */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(180deg, #2a1d0a, #1a1008)",
        borderTop: "2px solid rgba(255,255,255,0.05)",
      }} />

      {/* Workbench */}
      <div style={{ position: "absolute", bottom: 185, left: 0, right: 0, height: 28,
        background: "linear-gradient(180deg, #4a3018, #2d1e0a)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
      }} />

      {/* Step badge */}
      <div style={{ position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>Schritt 1 📏</div>

      <div style={{ position: "absolute", top: 196, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 60, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>Messen & Anzeichnen</div>

      {/* Wood plank on bench */}
      <div style={{
        position: "absolute", bottom: 213, left: 80,
        translate: `${plankX}px 0`,
        width: 820, height: 70,
        borderRadius: 6,
        background: "linear-gradient(180deg, #DEB887 0%, #C4955A 50%, #A0784A 100%)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
        overflow: "hidden",
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ position: "absolute", top: 10 + i * 16, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
        ))}
      </div>

      {/* Ruler */}
      <div style={{
        position: "absolute", bottom: 288, left: 120,
        width: rulerWidth, height: 38,
        background: "linear-gradient(180deg, #F5E642, #D4C400)",
        borderRadius: "0 5px 5px 0",
        overflow: "hidden",
        boxShadow: "0 3px 12px rgba(0,0,0,0.4)",
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: i * 18 + 4, bottom: 0, width: 1,
            height: i % 5 === 0 ? 22 : 10,
            background: "rgba(0,0,0,0.5)",
          }} />
        ))}
      </div>

      {/* 80cm label */}
      <div style={{
        position: "absolute", bottom: 340, left: 110, opacity: labelOpacity,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          background: "#FFE500", borderRadius: 10, padding: "8px 20px",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 42, fontWeight: 900, color: "#111",
        }}>80 cm</div>
        <div style={{ color: "#F4A460", fontSize: 34, fontWeight: 700 }}>Tiefe</div>
      </div>

      {/* Person 1 — left, holding plank down */}
      <div style={{ position: "absolute", bottom: 195, left: 30 }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={-40} rightArmAngle={-35}
          leftForearmAngle={60} rightForearmAngle={60}
          leftLegAngle={12} rightLegAngle={-5}
          bodyLean={p1Lean}
          scale={1.55}
        />
      </div>

      {/* Person 2 — right, holding ruler */}
      <div style={{ position: "absolute", bottom: 195, right: 40 }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={p2ArmAngle} rightArmAngle={-50}
          leftForearmAngle={40} rightForearmAngle={80}
          leftLegAngle={-10} rightLegAngle={10}
          flip scale={1.55}
        />
      </div>

      {/* Tip */}
      <div style={{
        position: "absolute", bottom: 60, left: 60, right: 60,
        opacity: labelOpacity,
        background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ color: "#F4A460", fontSize: 30, fontWeight: 700 }}>
          💡 Tipp: Immer zweimal messen!
        </div>
      </div>
    </AbsoluteFill>
  );
};
