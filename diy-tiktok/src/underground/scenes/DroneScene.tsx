import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, SceneTitle, FadeBlack, Tree } from "../Cinematic";

// 0–390 (13s) — Cinematic drone pull-back over forest, person visible below

export const DroneScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 390;

  // Drone zoom-out effect: start very close (scale 2.5), pull back to 1
  const scale = interpolate(frame, [0, TOTAL], [2.8, 1.0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  // Subtle drift right
  const tx = interpolate(frame, [0, TOTAL], [-60, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });
  const ty = interpolate(frame, [0, TOTAL], [-40, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Forest mist
  const mistOpacity = interpolate(frame, [0, 120, 300, 390], [0.6, 0.3, 0.2, 0.4], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Person marking - appears around frame 200
  const personOpacity = interpolate(frame, [200, 230], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Marking line draws
  const markProgress = interpolate(frame, [220, 350], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Rope/string marks out a rectangle
  const MARK_X = 820, MARK_Y = 530, MARK_W = 280, MARK_H = 220;
  const perim = 2 * (MARK_W + MARK_H);

  const trees = [
    { x: 120, h: 340, color: "#192e10" },
    { x: 280, h: 290, color: "#1e3612" },
    { x: 60,  h: 260, color: "#152a0e" },
    { x: 1700, h: 360, color: "#192e10" },
    { x: 1820, h: 300, color: "#1a3011" },
    { x: 1600, h: 250, color: "#172c0f" },
    { x: 400,  h: 200, color: "#1c3213" },
    { x: 1500, h: 220, color: "#1b3112" },
    { x: 960,  h: 180, color: "#192e10" },
  ];

  return (
    <AbsoluteFill style={{ background: "#0d1a08", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        scale: String(scale),
        translate: `${tx}px ${ty}px`,
        transformOrigin: "center center",
      }}>
        {/* Sky */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #1a2e10 0%, #2d4a1a 30%, #3d5a22 50%, #4a6428 60%, #5a7830 70%, #3d5020 100%)",
        }} />

        {/* Ground */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 520,
          background: "linear-gradient(180deg, #2d3d15 0%, #3a4e1a 20%, #4a5a22 40%, #556628 60%, #3d4e1a 100%)",
        }} />

        {/* Mid ground variation */}
        <div style={{
          position: "absolute", bottom: 350, left: 0, right: 0, height: 200,
          background: "linear-gradient(180deg, transparent 0%, rgba(30,50,10,0.7) 100%)",
        }} />

        {/* Trees */}
        <svg style={{ position: "absolute", bottom: 340, left: 0, right: 0, width: "100%", height: 400 }}>
          {trees.map((t, i) => (
            <Tree key={i} x={t.x} h={t.h} color={t.color} trunk="#2a1508" />
          ))}
        </svg>

        {/* Ground texture patches */}
        {[0,1,2,3,4,5,6,7,8].map(i => (
          <div key={i} style={{
            position: "absolute",
            left: (i * 233 + 50) % 1800,
            top: 580 + (i * 47) % 200,
            width: 80 + (i * 37) % 120,
            height: 20 + (i * 13) % 30,
            borderRadius: "50%",
            background: "rgba(20,12,5,0.3)",
          }} />
        ))}

        {/* Marking rectangle on ground */}
        <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible" }}>
          {/* Stakes */}
          {[
            [MARK_X, MARK_Y], [MARK_X + MARK_W, MARK_Y],
            [MARK_X, MARK_Y + MARK_H], [MARK_X + MARK_W, MARK_Y + MARK_H],
          ].map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={6} fill="#c8a060"
              opacity={markProgress > (i * 0.25) ? 1 : 0} />
          ))}
          {/* Rope */}
          <rect
            x={MARK_X} y={MARK_Y} width={MARK_W} height={MARK_H}
            fill="none" stroke="#d4a060" strokeWidth={3}
            strokeDasharray={perim}
            strokeDashoffset={perim * (1 - markProgress)}
            opacity={0.9}
          />
        </svg>

        {/* Person (top-down silhouette) */}
        <div style={{
          position: "absolute", left: MARK_X - 40, top: MARK_Y + MARK_H / 2 - 20,
          opacity: personOpacity,
        }}>
          <div style={{
            width: 28, height: 56,
            background: "#2a1a0a",
            borderRadius: "50% 50% 30% 30%",
            boxShadow: "0 6px 0 #1a1005",
          }} />
        </div>

        {/* Forest mist */}
        <div style={{
          position: "absolute", bottom: 300, left: 0, right: 0, height: 250,
          background: "linear-gradient(180deg, transparent 0%, rgba(180,210,140,0.15) 50%, transparent 100%)",
          opacity: mistOpacity,
        }} />
      </div>

      <Grain opacity={0.055} />
      <Vignette strength={0.7} />
      {/* Color grade: warm green */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 88, pointerEvents: "none",
        background: "linear-gradient(135deg, rgba(10,30,5,0.15) 0%, rgba(60,80,10,0.08) 100%)",
        mixBlendMode: "multiply",
      }} />
      <SceneTitle title="Im Wald" sub="Kapitel 1" />
      <Letterbox />
      <FadeBlack inFrames={30} outFrames={25} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
