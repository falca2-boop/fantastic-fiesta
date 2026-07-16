import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Person } from "../Person";

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();

  const p1X = interpolate(frame, [0, 40], [-300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const p2X = interpolate(frame, [10, 50], [300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const titleOpacity = interpolate(frame, [35, 60], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleY = interpolate(frame, [35, 60], [30, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Arm wave
  const wave = interpolate(frame, [50, 70, 90], [0, -30, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const exitOpacity = interpolate(frame, [78, 90], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "linear-gradient(180deg, #1a0f00 0%, #0d0800 100%)", overflow: "hidden" }}>
      {/* Warm spotlight */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 55% at 50% 70%, rgba(220,140,40,0.22) 0%, transparent 65%)",
      }} />

      {/* Workshop floor */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 220,
        background: "linear-gradient(180deg, #2a1d0a 0%, #1a1008 100%)",
        borderTop: "2px solid rgba(255,255,255,0.06)",
      }} />

      {/* Person 1 — left, facing right */}
      <div style={{
        position: "absolute", bottom: 200, left: 100,
        translate: `${p1X}px 0`,
      }}>
        <Person
          skin="#F4A261" shirt="#3B82F6" pants="#1E293B" hairColor="#3D2B1F"
          leftArmAngle={wave} rightArmAngle={25}
          leftForearmAngle={20} rightForearmAngle={20}
          leftLegAngle={8} rightLegAngle={-8}
          scale={1.7}
        />
      </div>

      {/* Person 2 — right, facing left */}
      <div style={{
        position: "absolute", bottom: 200, right: 80,
        translate: `${p2X}px 0`,
      }}>
        <Person
          skin="#A0522D" shirt="#EF4444" pants="#374151" hairColor="#111"
          leftArmAngle={-wave} rightArmAngle={20}
          leftForearmAngle={20} rightForearmAngle={20}
          leftLegAngle={-8} rightLegAngle={8}
          flip scale={1.7}
        />
      </div>

      {/* Shelf between them */}
      <div style={{
        position: "absolute", bottom: 210, left: "50%", translate: "-50% 0",
        width: 260, opacity: titleOpacity,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            height: 24, marginBottom: 8,
            background: "linear-gradient(180deg, #DEB887, #A0784A)",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }} />
        ))}
      </div>

      {/* Title */}
      <div style={{
        position: "absolute", top: 120, left: 60, right: 60,
        opacity: titleOpacity,
        translate: `0 ${titleY}px`,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 96, fontWeight: 900, color: "#fff",
          letterSpacing: -3, lineHeight: 1,
          textShadow: "0 4px 32px rgba(0,0,0,0.9)",
        }}>DIY</div>
        <div style={{
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 48, fontWeight: 900, color: "#F4A460",
          textShadow: "0 4px 20px rgba(0,0,0,0.8)",
        }}>Regal aus Holz</div>
        <div style={{
          marginTop: 16,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 50, padding: "8px 28px",
          border: "1px solid rgba(255,255,255,0.15)",
          display: "inline-block",
          color: "#F4A460", fontSize: 28, fontWeight: 700,
        }}>
          Gemeinsam bauen! 👷‍♂️👷‍♀️
        </div>
      </div>
    </AbsoluteFill>
  );
};
