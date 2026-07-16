import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const AssembleScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [360, 390], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const leftX = interpolate(frame, [20, 60], [-300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const rightX = interpolate(frame, [30, 70], [300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const shelf1Y = interpolate(frame, [75, 105], [-200, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.2, 0.64, 1),
  });
  const shelf2Y = interpolate(frame, [95, 125], [-200, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.2, 0.64, 1),
  });
  const shelf3Y = interpolate(frame, [115, 145], [-200, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.2, 0.64, 1),
  });

  const check1 = interpolate(frame, [190, 210], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check2 = interpolate(frame, [220, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check3 = interpolate(frame, [250, 270], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Arms raise to hold panels
  const p1Arm = interpolate(frame, [20, 60], [20, -70], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const p2Arm = interpolate(frame, [30, 70], [20, -70], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const PLANK: React.CSSProperties = {
    background: "linear-gradient(180deg, #DEB887, #A0784A)",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
  };

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "linear-gradient(180deg, #0d1108 0%, #080d05 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 80% at 50% 60%, rgba(60,120,30,0.1) 0%, transparent 65%)",
      }} />

      {/* Floor */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(180deg, #151a10, #0d1108)",
        borderTop: "2px solid rgba(255,255,255,0.04)",
      }} />

      <div style={{ position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>Schritt 3 🪛</div>

      <div style={{ position: "absolute", top: 196, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 60, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>Zusammenbauen!</div>

      {/* Shelf structure */}
      <div style={{ position: "absolute", top: 370, left: "50%", translate: "-50% 0", width: 480 }}>
        {/* Side panels */}
        <div style={{ ...PLANK, position: "absolute", left: 0, top: 0, width: 55, height: 380, translate: `${leftX}px 0` }} />
        <div style={{ ...PLANK, position: "absolute", right: 0, top: 0, width: 55, height: 380, translate: `${rightX}px 0` }} />
        {/* Shelves */}
        {[
          { top: 0, Y: shelf1Y, check: check1 },
          { top: 155, Y: shelf2Y, check: check2 },
          { top: 310, Y: shelf3Y, check: check3 },
        ].map(({ top, Y, check }, i) => (
          <div key={i}>
            <div style={{ ...PLANK, position: "absolute", left: 55, right: 55, top, height: 48, translate: `0 ${Y}px` }} />
            <div style={{ position: "absolute", right: 60, top: top + 6, opacity: check, fontSize: 30 }}>✅</div>
          </div>
        ))}
      </div>

      {/* Person 1 — left, arms up holding left panel */}
      <div style={{ position: "absolute", bottom: 195, left: 10, translate: `${leftX * 0.4}px 0` }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={p1Arm} rightArmAngle={p1Arm}
          leftForearmAngle={-20} rightForearmAngle={-20}
          leftLegAngle={15} rightLegAngle={-8}
          scale={1.5}
        />
      </div>

      {/* Person 2 — right, arms up holding right panel */}
      <div style={{ position: "absolute", bottom: 195, right: 10, translate: `${-rightX * 0.4}px 0` }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={p2Arm} rightArmAngle={p2Arm}
          leftForearmAngle={-20} rightForearmAngle={-20}
          leftLegAngle={-15} rightLegAngle={8}
          flip scale={1.5}
        />
      </div>

      <div style={{
        position: "absolute", bottom: 50, left: 60, right: 60,
        opacity: check2,
        background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ color: "#4ade80", fontSize: 28, fontWeight: 700 }}>
          ✅ Schrauben nicht zu fest anziehen!
        </div>
      </div>
    </AbsoluteFill>
  );
};
