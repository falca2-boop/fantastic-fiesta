import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const DrillScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [250, 280], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Drill arm presses down repeatedly
  const drillArmAngle = interpolate(
    frame,
    [40, 70, 90, 115, 140, 165, 190, 215],
    [-60, -80, -60, -80, -60, -80, -60, -80],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.4, 0, 0.6, 1) }
  );

  // Holes appear
  const hole1 = interpolate(frame, [72, 82], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hole2 = interpolate(frame, [117, 127], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hole3 = interpolate(frame, [162, 172], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const warningOpacity = interpolate(frame, [85, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Person 2 steadying the board (leans on it)
  const p2Lean = interpolate(frame, [15, 40], [0, -12], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "linear-gradient(180deg, #0e0d14 0%, #08080f 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(80,60,180,0.12) 0%, transparent 60%)",
      }} />

      {/* Floor */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(180deg, #18161f, #0e0d14)",
        borderTop: "2px solid rgba(255,255,255,0.04)",
      }} />

      {/* Workbench */}
      <div style={{ position: "absolute", bottom: 185, left: 0, right: 0, height: 28,
        background: "linear-gradient(180deg, #3a3042, #22202a)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
      }} />

      <div style={{ position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>Schritt 2 🔩</div>

      <div style={{ position: "absolute", top: 196, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 60, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>Vorbohren!</div>

      {/* Plank on bench */}
      <div style={{
        position: "absolute", bottom: 213, left: 80, right: 80, height: 72,
        borderRadius: 8,
        background: "linear-gradient(180deg, #DEB887, #A0784A)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
        overflow: "hidden",
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ position: "absolute", top: 10+i*16, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
        ))}
        {/* Holes */}
        {[{x: 200, o: hole1}, {x: 460, o: hole2}, {x: 720, o: hole3}].map(({x, o}, i) => (
          <div key={i} style={{
            position: "absolute", top: "50%", left: x,
            translate: "-50% -50%",
            width: 26 * o, height: 26 * o, borderRadius: "50%",
            background: "rgba(10,5,0,0.95)",
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.9)",
          }} />
        ))}
      </div>

      {/* Person 1 — drilling, right arm down with drill */}
      <div style={{ position: "absolute", bottom: 195, left: 120 }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={-30} rightArmAngle={drillArmAngle}
          leftForearmAngle={40} rightForearmAngle={20}
          leftLegAngle={15} rightLegAngle={-8}
          scale={1.55}
        />
        {/* Drill emoji attached to right hand approximate position */}
        <div style={{
          position: "absolute",
          bottom: 220,
          left: 155,
          fontSize: 48,
          rotate: "90deg",
          filter: "drop-shadow(0 4px 10px rgba(0,0,200,0.4))",
        }}>🔧</div>
      </div>

      {/* Person 2 — steadying plank from other side */}
      <div style={{ position: "absolute", bottom: 195, right: 80 }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={-45} rightArmAngle={-40}
          leftForearmAngle={55} rightForearmAngle={55}
          leftLegAngle={-12} rightLegAngle={8}
          bodyLean={p2Lean}
          flip scale={1.55}
        />
      </div>

      {/* Warning */}
      <div style={{
        position: "absolute", bottom: 60, left: 60, right: 60,
        opacity: warningOpacity,
        background: "rgba(255,87,34,0.14)", borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,87,34,0.3)",
      }}>
        <div style={{ color: "#FF6B35", fontSize: 30, fontWeight: 700 }}>
          ⚠️ Vorbohren = kein Holzriss!
        </div>
      </div>
    </AbsoluteFill>
  );
};
