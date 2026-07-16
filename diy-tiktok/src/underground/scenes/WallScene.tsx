import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, SceneTitle, FadeBlack } from "../Cinematic";
import { Person } from "../../Person";

// 1050–1620 (19s) — Wände aus Holz und Naturstein sichern

export const WallScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 570;

  // Camera: slow push in
  const camScale = interpolate(frame, [0, TOTAL], [1, 1.06], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.0, 0, 1, 1),
  });

  // Planks slide in from sides, stagger
  const planks = [
    { y: 100, delay: 0,   side: "left"  as const },
    { y: 160, delay: 20,  side: "right" as const },
    { y: 220, delay: 40,  side: "left"  as const },
    { y: 280, delay: 60,  side: "right" as const },
    { y: 340, delay: 80,  side: "left"  as const },
    { y: 400, delay: 100, side: "right" as const },
  ];

  // Stones appear after planks
  const stoneProgress = interpolate(frame, [200, 450], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.7, 1),
  });

  const stones = [
    { x: 280, y: 380, w: 90, h: 50 }, { x: 370, y: 390, w: 70, h: 45 },
    { x: 440, y: 375, w: 100, h: 55 }, { x: 310, y: 430, w: 80, h: 50 },
    { x: 390, y: 435, w: 95, h: 48 },
    { x: 1080, y: 380, w: 85, h: 52 }, { x: 1165, y: 388, w: 75, h: 48 },
    { x: 1095, y: 435, w: 95, h: 50 }, { x: 1190, y: 430, w: 70, h: 52 },
  ];

  // Person hammering right arm
  const hammerArm = interpolate(
    frame,
    [0, 10, 20, 30, 40],
    [-50, -75, -50, -75, -50],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ background: "#0d0a06", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, scale: String(camScale), transformOrigin: "center center" }}>
        {/* Underground interior - cross section */}
        {/* Sky/outside visible at top */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 130,
          background: "linear-gradient(180deg, #4a6428 0%, #3a5018 60%, #2a3a10 100%)",
        }} />

        {/* Earth walls left */}
        <div style={{
          position: "absolute", top: 130, left: 0, width: 280, bottom: 0,
          background: "linear-gradient(90deg, #1a0d06 0%, #3a2210 60%, #5a3818 100%)",
        }} />

        {/* Earth walls right */}
        <div style={{
          position: "absolute", top: 130, right: 0, width: 280, bottom: 0,
          background: "linear-gradient(270deg, #1a0d06 0%, #3a2210 60%, #5a3818 100%)",
        }} />

        {/* Floor */}
        <div style={{
          position: "absolute", bottom: 0, left: 280, right: 280, height: 120,
          background: "linear-gradient(180deg, #2a1808 0%, #1a1006 100%)",
        }} />

        {/* Earth ceiling cross-section stripes */}
        <div style={{
          position: "absolute", top: 70, left: 280, right: 280, height: 60,
          background: "linear-gradient(180deg, rgba(58,80,16,0.9) 0%, rgba(90,56,24,0.8) 60%, transparent 100%)",
        }} />

        {/* PLANKS on walls */}
        {planks.map((p, i) => {
          const progress = interpolate(frame, [p.delay, p.delay + 30], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.bezier(0.34, 1.2, 0.64, 1),
          });
          const side = p.side === "left";
          return (
            <div key={i} style={{
              position: "absolute",
              left: side ? 280 * (1 - progress) : undefined,
              right: !side ? 280 * (1 - progress) : undefined,
              top: 130 + p.y,
              width: 260,
              height: 48,
              background: "linear-gradient(90deg, #DEB887, #C8A060, #A07840, #DEB887)",
              borderRadius: 3,
              boxShadow: "2px 0 12px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.1)",
              opacity: progress,
            }}>
              {/* Wood grain lines */}
              {[8, 20, 32].map(gy => (
                <div key={gy} style={{
                  position: "absolute", top: gy, left: 0, right: 0, height: 1,
                  background: "rgba(100,60,10,0.25)",
                }} />
              ))}
            </div>
          );
        })}

        {/* STONES at base */}
        {stones.map((s, i) => {
          const delay = i * 0.08;
          const o = interpolate(stoneProgress, [delay, delay + 0.12], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const sy = interpolate(stoneProgress, [delay, delay + 0.12], [s.y + 20, s.y], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{
              position: "absolute", left: s.x, top: sy,
              width: s.w, height: s.h,
              opacity: o,
              background: `linear-gradient(135deg, #808080, #606060, #707070)`,
              borderRadius: "6px 8px 4px 7px / 8px 5px 7px 4px",
              boxShadow: "2px 3px 8px rgba(0,0,0,0.6), inset 1px 1px 0 rgba(255,255,255,0.1)",
            }} />
          );
        })}

        {/* Interior pocket-light (torch glow) */}
        <div style={{
          position: "absolute",
          top: 400, left: "50%", translate: "-50% 0",
          width: 600, height: 400,
          background: "radial-gradient(ellipse at center, rgba(255,160,40,0.18) 0%, transparent 70%)",
        }} />

        {/* Person — inside pit, hammering */}
        <div style={{ position: "absolute", bottom: 120, left: "50%", translate: "-50% 0" }}>
          <Person
            skin="#c8803a" shirt="#4a3018" pants="#2a1a08" hairColor="#1a0d04"
            leftArmAngle={-20} rightArmAngle={hammerArm}
            leftForearmAngle={45} rightForearmAngle={30}
            leftLegAngle={8} rightLegAngle={-5}
            scale={1.45}
          />
          {/* Hammer */}
          <div style={{
            position: "absolute", bottom: 250, right: 55,
            fontSize: 40, rotate: "60deg",
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.7))",
          }}>🔨</div>
        </div>

        {/* Ambient dust motes */}
        {[0,1,2,3,4].map(i => {
          const fy = (frame * (0.4 + i * 0.15) + i * 80) % 400;
          const fx = 400 + i * 140 + Math.sin(frame * 0.03 + i) * 20;
          return (
            <div key={i} style={{
              position: "absolute", left: fx, top: 200 + fy,
              width: 3 + i, height: 3 + i,
              borderRadius: "50%",
              background: "rgba(200,160,80,0.5)",
              opacity: 0.4 + Math.sin(frame * 0.05 + i) * 0.2,
            }} />
          );
        })}
      </div>

      <Grain opacity={0.065} />
      <Vignette strength={0.72} />
      <SceneTitle title="Holz & Stein" sub="Kapitel 3 — Wandsicherung" />
      <Letterbox />
      <FadeBlack inFrames={20} outFrames={20} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
