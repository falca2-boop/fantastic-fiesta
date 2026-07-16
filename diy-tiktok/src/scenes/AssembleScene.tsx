import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const AssembleScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [350, 390], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Left side panel slides in from left
  const leftX = interpolate(frame, [20, 60], [-300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // Right side panel slides in from right
  const rightX = interpolate(frame, [30, 70], [300, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  // Shelves drop in from top
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
  // Screwdriver appears
  const screwOpacity = interpolate(frame, [150, 170], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const screwRotate = interpolate(frame, [170, 390], [0, 1440], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  // Checkmarks
  const check1 = interpolate(frame, [190, 210], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check2 = interpolate(frame, [220, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const check3 = interpolate(frame, [250, 270], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const PLANK = { color: "linear-gradient(180deg,#DEB887,#A0784A)", border: "rgba(255,255,255,0.12)" };
  const plankStyle: React.CSSProperties = {
    background: PLANK.color,
    borderRadius: 6,
    boxShadow: `0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)`,
    overflow: "hidden",
    position: "relative",
  };

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#0d1108", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 80% at 50% 60%, rgba(60,120,30,0.12) 0%, transparent 65%)",
      }} />

      <div style={{
        position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>
        Schritt 3 🪛
      </div>

      <div style={{
        position: "absolute", top: 195, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 64, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>
        Zusammenbauen!
      </div>

      {/* Shelf assembly visual */}
      <div style={{ position: "absolute", top: 360, left: "50%", translate: "-50% 0", width: 560 }}>
        {/* Left side panel */}
        <div style={{
          ...plankStyle,
          position: "absolute", left: 0, top: 0,
          width: 70, height: 460,
          translate: `${leftX}px 0`,
        }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ position: "absolute", top: 20+i*60, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
          ))}
        </div>

        {/* Right side panel */}
        <div style={{
          ...plankStyle,
          position: "absolute", right: 0, top: 0,
          width: 70, height: 460,
          translate: `${rightX}px 0`,
        }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ position: "absolute", top: 20+i*60, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
          ))}
        </div>

        {/* Shelves */}
        {[
          { top: 0, Y: shelf1Y, check: check1 },
          { top: 180, Y: shelf2Y, check: check2 },
          { top: 360, Y: shelf3Y, check: check3 },
        ].map(({ top, Y, check }, i) => (
          <div key={i}>
            <div style={{
              ...plankStyle,
              position: "absolute", left: 70, right: 70,
              top, height: 55,
              translate: `0 ${Y}px`,
            }}>
              {[0,1,2].map(j => (
                <div key={j} style={{ position: "absolute", top: 10+j*15, left: 0, right: 0, height: 1, background: "rgba(100,60,10,0.2)" }} />
              ))}
            </div>
            {/* Checkmark */}
            <div style={{
              position: "absolute", right: 80, top: top + 8,
              opacity: check,
              scale: String(check),
              fontSize: 36,
            }}>
              ✅
            </div>
          </div>
        ))}
      </div>

      {/* Screwdriver */}
      <div style={{
        position: "absolute", bottom: 180, right: 80,
        opacity: screwOpacity,
        fontSize: 70,
        rotate: `${screwRotate}deg`,
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
      }}>
        🪛
      </div>

      <div style={{
        position: "absolute", bottom: 80, left: 60, right: 60,
        opacity: check2,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ color: "#4ade80", fontSize: 30, fontWeight: 700 }}>
          ✅ Schrauben nicht zu fest anziehen!
        </div>
      </div>
    </AbsoluteFill>
  );
};
