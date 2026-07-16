import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, SceneTitle, FadeBlack, Tree } from "../Cinematic";
import { Person } from "../../Person";

// 390–1050 (22s) — side-view digging with timelapse effect, hole grows

export const DiggingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 660;

  // Timelapse flicker: rapid brightness pulse every ~8 frames
  const tlFlicker = interpolate(frame % 8, [0, 2, 4, 6, 8], [0.92, 1, 0.96, 1, 0.92], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Hole depth grows over time (0 → 420px deep)
  const holeDepth = interpolate(frame, [30, TOTAL - 60], [0, 420], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0, 0.8, 1),
  });

  // Hole width grows slightly
  const holeWidth = interpolate(frame, [30, TOTAL - 60], [80, 380], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.7, 1),
  });

  // Person shoveling arm angle - rapid motion
  const shovelArm = interpolate(
    frame,
    [0, 12, 25, 37, 50, 62],
    [-40, -80, -40, -80, -40, -80],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const shovelLean = interpolate(
    frame,
    [0, 12, 25],
    [-8, -18, -8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Dirt particles thrown left
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    angle: 130 + (i * 13) % 80,
    speed: 3 + (i * 7) % 8,
    size: 4 + (i * 3) % 10,
    color: i % 3 === 0 ? "#6b4423" : i % 3 === 1 ? "#4a3015" : "#7a5530",
    phase: (i * 11) % 24,
  }));

  // Sun rays
  const sunOpacity = interpolate(frame, [0, 60, 500, 600], [0, 0.3, 0.3, 0.1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Soil layers in the pit wall
  const soilLayers = [
    { y: 0, h: 60, color: "#3a5018", label: "Humus" },
    { y: 60, h: 100, color: "#6b4423" },
    { y: 160, h: 140, color: "#7a5530" },
    { y: 300, h: 120, color: "#8a6640" },
  ];

  return (
    <AbsoluteFill style={{ opacity: tlFlicker, background: "#1a1008", overflow: "hidden" }}>
      {/* Sky with forest top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 380,
        background: "linear-gradient(180deg, #5a7838 0%, #4a6428 40%, #3a5020 100%)",
      }} />

      {/* Sun rays */}
      <div style={{
        position: "absolute", top: -100, right: 300, width: 600, height: 700,
        background: "conic-gradient(from 150deg at 50% 0%, transparent 5deg, rgba(255,230,150,0.15) 8deg, transparent 12deg, transparent 25deg, rgba(255,230,150,0.1) 28deg, transparent 32deg)",
        opacity: sunOpacity,
      }} />

      {/* Tree row */}
      <svg style={{ position: "absolute", top: 80, left: 0, right: 0, width: "100%", height: 350 }}>
        {[80, 240, 420, 1200, 1400, 1550, 1700, 1860].map((x, i) => (
          <Tree key={i} x={x} h={220 + (i * 40) % 120} color={i % 2 === 0 ? "#1e3410" : "#192e0d"} trunk="#2a1508" />
        ))}
      </svg>

      {/* Ground surface */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 580,
        background: "linear-gradient(180deg, #3a5018 0%, #2d3d12 8%, #4a3010 15%, #5a4020 100%)",
      }} />

      {/* Ground grass top edge */}
      <div style={{
        position: "absolute", bottom: 580, left: 0, right: 0, height: 28,
        background: "linear-gradient(180deg, transparent, rgba(60,90,20,0.9))",
        borderRadius: "40% 40% 0 0",
      }} />

      {/* Hole in ground - cross-section view */}
      <div style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        translate: "-50% 0",
        width: holeWidth,
        height: holeDepth,
        background: "#0d0a06",
        borderRadius: "4px 4px 0 0",
        overflow: "hidden",
        boxShadow: "inset -8px 0 24px rgba(0,0,0,0.8), inset 8px 0 24px rgba(0,0,0,0.8)",
      }}>
        {/* Soil layer walls */}
        {soilLayers.map((layer, i) => (
          holeDepth > layer.y + 20 && (
            <div key={i} style={{
              position: "absolute",
              top: layer.y,
              left: 0,
              right: 0,
              height: Math.min(layer.h, holeDepth - layer.y),
              background: layer.color,
              borderBottom: "1px solid rgba(0,0,0,0.3)",
            }}>
              {layer.label && (
                <div style={{
                  position: "absolute", right: 8, top: 4,
                  color: "rgba(255,255,255,0.5)", fontSize: 11,
                  fontFamily: "Arial, sans-serif",
                }}>{layer.label}</div>
              )}
            </div>
          )
        ))}
        {/* Darkness at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
          background: "linear-gradient(0deg, #050302, transparent)",
        }} />
      </div>

      {/* Soil mound left of hole */}
      <div style={{
        position: "absolute",
        left: `calc(50% - ${holeWidth / 2 + 20}px)`,
        bottom: 580,
        translate: "-100% 0",
      }}>
        <div style={{
          width: Math.max(0, holeDepth * 0.6),
          height: Math.max(0, holeDepth * 0.25),
          background: "radial-gradient(ellipse at bottom, #5a4020, #3a2810)",
          borderRadius: "50% 50% 0 0",
        }} />
      </div>

      {/* Dirt particles flying left */}
      {holeDepth > 10 && particles.map(p => {
        const t = (frame + p.phase) % 24;
        const px = interpolate(t, [0, 12, 24], [960 - holeWidth / 2 - 20, 960 - holeWidth / 2 - 20 - p.speed * 18, 960 - holeWidth / 2 - 20 - p.speed * 40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const py = interpolate(t, [0, 8, 24], [800 - holeDepth * 0.6, 780 - holeDepth * 0.6 - p.speed * 5, 800 - holeDepth * 0.6 + 20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const o = interpolate(t, [0, 4, 18, 24], [0, 0.9, 0.7, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={p.id} style={{
            position: "absolute", left: px, top: py,
            width: p.size, height: p.size * 0.7,
            borderRadius: "50%",
            background: p.color,
            opacity: o * Math.min(1, holeDepth / 40),
          }} />
        );
      })}

      {/* Person digging — stands in/next to hole */}
      <div style={{
        position: "absolute",
        left: "50%",
        bottom: Math.max(580, 580 + (holeDepth > 100 ? -holeDepth * 0.55 : 0)),
        translate: `${holeWidth * 0.3}px 0`,
      }}>
        <Person
          skin="#c8803a" shirt="#4a3018" pants="#2a1a08" hairColor="#1a0d04"
          leftArmAngle={shovelArm} rightArmAngle={shovelArm - 20}
          leftForearmAngle={30} rightForearmAngle={25}
          leftLegAngle={8} rightLegAngle={-5}
          bodyLean={shovelLean}
          scale={1.4}
        />
        {/* Shovel */}
        <div style={{
          position: "absolute", bottom: 180, left: 60,
          fontSize: 44, rotate: "45deg",
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.7))",
        }}>⛏️</div>
      </div>

      {/* Depth indicator */}
      {holeDepth > 60 && (
        <div style={{
          position: "absolute", right: 80, bottom: 200,
          color: "rgba(255,255,255,0.7)",
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: 32, fontWeight: 900,
          textShadow: "0 2px 12px rgba(0,0,0,0.9)",
        }}>
          ↕ {Math.round(holeDepth / 420 * 210)} cm
        </div>
      )}

      <Grain opacity={0.06} />
      <Vignette strength={0.65} />
      <SceneTitle title="Aushub" sub="Kapitel 2 — Zeitraffer" />
      <Letterbox />
      <FadeBlack inFrames={20} outFrames={20} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
