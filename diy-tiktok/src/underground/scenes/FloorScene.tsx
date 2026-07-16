import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, SceneTitle, FadeBlack } from "../Cinematic";
import { Person } from "../../Person";

// 1620–2070 (15s) — Boden glätten und mit Steinen auslegen

export const FloorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 450;

  // Camera tilt down — looking at floor
  const camTY = interpolate(frame, [0, 200], [0, -30], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Floor stones lay out grid 6x4
  const COLS = 8, ROWS = 4;
  const floorStones = Array.from({ length: COLS * ROWS }, (_, i) => ({
    col: i % COLS, row: Math.floor(i / COLS), i,
    w: 100 + (i * 13) % 30, h: 60 + (i * 7) % 20,
    shade: `hsl(${20 + (i * 11) % 15}, ${12 + (i * 5) % 10}%, ${30 + (i * 7) % 20}%)`,
  }));

  const stoneDelay = (i: number) => i * (1 / (COLS * ROWS) * 0.8);
  const stoneProgress = interpolate(frame, [40, 320], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.7, 1),
  });

  // Grout lines appear after stones
  const groutOpacity = interpolate(frame, [320, 380], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Person smoothing — kneel/crouch pose
  const smoothArm = interpolate(frame, [0, 20, 40, 60], [-15, -35, -15, -35], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#100c07", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, translate: `0 ${camTY}px` }}>
        {/* Underground interior */}
        {/* Ceiling */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 160,
          background: "linear-gradient(180deg, #2a1a08 0%, #1a1006 100%)",
        }}>
          {/* Ceiling planks */}
          {[0,1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              position: "absolute", left: i * 280, top: 20, width: 260, height: 50,
              background: "linear-gradient(180deg, #C8A060, #A07840)",
              borderRight: "4px solid rgba(0,0,0,0.4)",
            }} />
          ))}
        </div>

        {/* Walls */}
        <div style={{
          position: "absolute", top: 160, left: 0, width: 180, bottom: 0,
          background: "linear-gradient(90deg, #0d0805, #2a1a08, #3a2810)",
        }}>
          {/* Wall planks */}
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              position: "absolute", top: i * 100, left: 0, right: 0, height: 90,
              background: "linear-gradient(180deg, #DEB887, #A07840)",
              borderBottom: "4px solid rgba(0,0,0,0.5)",
            }} />
          ))}
        </div>
        <div style={{
          position: "absolute", top: 160, right: 0, width: 180, bottom: 0,
          background: "linear-gradient(270deg, #0d0805, #2a1a08, #3a2810)",
        }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              position: "absolute", top: i * 100, left: 0, right: 0, height: 90,
              background: "linear-gradient(180deg, #DEB887, #A07840)",
              borderBottom: "4px solid rgba(0,0,0,0.5)",
            }} />
          ))}
        </div>

        {/* Floor area */}
        <div style={{
          position: "absolute", bottom: 0, left: 180, right: 180,
          top: 580,
          background: "#1a1208",
        }}>
          {/* Perspective floor grid */}
          <div style={{
            position: "absolute", inset: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            gap: groutOpacity * 3,
            padding: groutOpacity * 4,
          }}>
            {floorStones.map(s => {
              const delay = stoneDelay(s.i);
              const o = interpolate(stoneProgress, [delay, delay + 0.1], [0, 1], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              });
              const sy = interpolate(stoneProgress, [delay, delay + 0.1], [12, 0], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              });
              return (
                <div key={s.i} style={{
                  background: s.shade,
                  opacity: o,
                  translate: `0 ${sy}px`,
                  borderRadius: 2,
                  boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.06), inset -1px -1px 0 rgba(0,0,0,0.4)",
                }} />
              );
            })}
          </div>
        </div>

        {/* Warm torch light from left wall */}
        <div style={{
          position: "absolute", top: 300, left: 160, width: 500, height: 500,
          background: "radial-gradient(ellipse at left center, rgba(255,140,30,0.25) 0%, transparent 70%)",
        }} />
        {/* Torch emoji */}
        <div style={{ position: "absolute", top: 290, left: 140, fontSize: 42 }}>🕯️</div>

        {/* Person smoothing floor */}
        <div style={{ position: "absolute", bottom: 200, left: "45%", translate: "-50% 0" }}>
          <Person
            skin="#c8803a" shirt="#4a3018" pants="#2a1a08" hairColor="#1a0d04"
            leftArmAngle={smoothArm} rightArmAngle={smoothArm - 10}
            leftForearmAngle={60} rightForearmAngle={55}
            leftLegAngle={30} rightLegAngle={-25}
            bodyLean={-18}
            scale={1.35}
          />
          {/* Trowel */}
          <div style={{
            position: "absolute", bottom: 150, left: 30,
            fontSize: 34, rotate: "-30deg",
          }}>🧱</div>
        </div>

        {/* Sand/grout dust mist near floor */}
        <div style={{
          position: "absolute", bottom: 200, left: 180, right: 180, height: 80,
          background: "linear-gradient(0deg, rgba(200,180,130,0.12), transparent)",
          opacity: stoneProgress,
        }} />
      </div>

      <Grain opacity={0.062} />
      <Vignette strength={0.75} />
      <SceneTitle title="Steinboden" sub="Kapitel 4 — Bodenverlegung" />
      <Letterbox />
      <FadeBlack inFrames={20} outFrames={20} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
