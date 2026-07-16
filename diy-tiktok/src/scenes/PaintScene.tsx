import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const PaintScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [290, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Brush sweeps (fixed: no duplicate input values)
  const brushX = interpolate(
    frame,
    [30, 79, 81, 129, 131, 179, 181, 230],
    [100, 820, 820, 100, 100, 820, 820, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.4, 0, 0.6, 1) }
  );
  const brushRow = interpolate(frame, [30, 230], [0, 2.8], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const paint1 = interpolate(frame, [30, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const paint2 = interpolate(frame, [80, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const paint3 = interpolate(frame, [130, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const sheenX = interpolate(frame, [180, 280], [-1200, 1200], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const resultOpacity = interpolate(frame, [225, 255], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Person painting arm swings left-right with brush
  const paintArm = interpolate(
    frame,
    [30, 79, 81, 129, 131, 179],
    [-55, -20, -20, -55, -55, -20],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Person 2 watches and holds can
  const p2bobble = interpolate(frame, [0, 60, 120, 180, 240], [0, -8, 0, -8, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "linear-gradient(180deg, #10080e 0%, #0a060b 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(200,80,200,0.08) 0%, transparent 65%)",
      }} />

      {/* Floor */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(180deg, #160d18, #100810)",
        borderTop: "2px solid rgba(255,255,255,0.04)",
      }} />

      {/* Workbench */}
      <div style={{ position: "absolute", bottom: 185, left: 0, right: 0, height: 28,
        background: "linear-gradient(180deg, #3a2842, #22182a)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
      }} />

      <div style={{ position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>Schritt 4 🖌️</div>

      <div style={{ position: "absolute", top: 196, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 60, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>Lackieren!</div>

      {/* Shelf on bench */}
      <div style={{
        position: "absolute", bottom: 213, left: 60, right: 260,
        borderRadius: 10,
        background: "linear-gradient(180deg, #DEB887, #A0784A)",
        boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 56, borderBottom: "1px solid rgba(0,0,0,0.18)", position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(255,220,100,0.2)",
              opacity: [paint1, paint2, paint3][i],
            }} />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.3) 50%, transparent 65%)",
              translate: `${sheenX}px 0`,
              opacity: [paint1, paint2, paint3][i],
            }} />
          </div>
        ))}
      </div>

      {/* Paintbrush emoji moving with person */}
      <div style={{
        position: "absolute",
        bottom: 290 + Math.round(brushRow) * 56,
        left: brushX - 20,
        fontSize: 44,
        rotate: "100deg",
        filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))",
      }}>
        🖌️
      </div>

      {/* Person 1 — painting */}
      <div style={{ position: "absolute", bottom: 195, left: 60 }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={paintArm} rightArmAngle={-25}
          leftForearmAngle={30} rightForearmAngle={40}
          leftLegAngle={10} rightLegAngle={-8}
          bodyLean={-10}
          scale={1.5}
        />
      </div>

      {/* Person 2 — right, holds lacquer can and watches */}
      <div style={{ position: "absolute", bottom: 195 + p2bobble, right: 40 }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={-30} rightArmAngle={20}
          leftForearmAngle={80} rightForearmAngle={30}
          leftLegAngle={-8} rightLegAngle={5}
          flip scale={1.4}
        />
        {/* Lacquer can in left hand */}
        <div style={{
          position: "absolute", bottom: 270, right: 108,
          fontSize: 36,
        }}>🪣</div>
      </div>

      <div style={{
        position: "absolute", bottom: 50, left: 60, right: 60,
        opacity: resultOpacity,
        background: "rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ color: "#FFE500", fontSize: 32, fontWeight: 700, fontFamily: "Arial Black, Arial, sans-serif" }}>
          ✨ Klarlack matt — 2 Schichten
        </div>
      </div>
    </AbsoluteFill>
  );
};
