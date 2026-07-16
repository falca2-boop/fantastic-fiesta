import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, SceneTitle, FadeBlack } from "../Cinematic";

// 2070–2340 (9s) — Belüftung und Entwässerung

export const VentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 270;

  // Camera slow drift left
  const camX = interpolate(frame, [0, TOTAL], [0, -40], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Ventilation pipe build-in
  const pipeProgress = interpolate(frame, [20, 140], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Air flow particles
  const airParticles = Array.from({ length: 12 }, (_, i) => ({
    id: i, phase: (i * 22) % 60, speed: 2 + (i * 7) % 4,
  }));

  // Drainage trench reveal
  const drainProgress = interpolate(frame, [120, 240], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Water droplets in drain
  // Labels pop in
  const label1Op = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label2Op = interpolate(frame, [170, 200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#0c0908", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, translate: `${camX}px 0` }}>
        {/* Underground room - wide shot */}
        {/* Ceiling */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 200,
          background: "linear-gradient(180deg, #1a1008 0%, #0c0906 100%)",
        }}>
          {[0,1,2,3,4,5,6,7].map(i => (
            <div key={i} style={{
              position: "absolute", left: i * 250, top: 30, width: 230, height: 55,
              background: "linear-gradient(180deg, #C4984A, #8A6030)",
              borderRight: "5px solid rgba(0,0,0,0.5)",
            }} />
          ))}
        </div>

        {/* Wall left + right */}
        {["left" as const, "right" as const].map(side => (
          <div key={side} style={{
            position: "absolute", top: 200,
            [side]: 0, width: 160, bottom: 0,
            background: `linear-gradient(${side === "left" ? "90" : "270"}deg, #0c0906, #2a1a08, #3a2410)`,
          }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{
                position: "absolute", top: i * 110, left: 0, right: 0, height: 100,
                background: "linear-gradient(180deg, #C8A060 0%, #907030 100%)",
                borderBottom: "5px solid rgba(0,0,0,0.6)",
              }} />
            ))}
          </div>
        ))}

        {/* Floor */}
        <div style={{
          position: "absolute", bottom: 0, left: 160, right: 160, height: 160,
          display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gridTemplateRows: "repeat(3, 1fr)",
          gap: 3, padding: 3, background: "#111",
        }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{
              background: `hsl(${25 + (i * 7) % 10}, 10%, ${28 + (i * 5) % 18}%)`,
              borderRadius: 2,
            }} />
          ))}
        </div>

        {/* === VENTILATION PIPE === */}
        {/* Vertical pipe through ceiling */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 380,
          width: 60,
          height: 200 * pipeProgress,
          background: "linear-gradient(90deg, #808080, #a0a0a0, #707070)",
          borderRadius: "0 0 4px 4px",
          boxShadow: "4px 0 12px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          {/* Pipe sheen */}
          <div style={{
            position: "absolute", top: 0, left: 0, width: 18, bottom: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
          }} />
        </div>

        {/* Horizontal pipe */}
        <div style={{
          position: "absolute", top: 195, left: 340,
          width: 340 * pipeProgress, height: 54,
          background: "linear-gradient(180deg, #909090, #707070, #808080)",
          borderRadius: pipeProgress > 0.95 ? "0 4px 4px 0" : "0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
        }} />

        {/* Vent grille */}
        {pipeProgress > 0.9 && (
          <div style={{
            position: "absolute", top: 188, left: 660, width: 50, height: 68,
            background: "#505050",
            borderRadius: 4,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr 1fr 1fr",
            gap: 3, padding: 4,
            boxShadow: "2px 2px 8px rgba(0,0,0,0.7)",
          }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} style={{ background: "#333", borderRadius: 1 }} />
            ))}
          </div>
        )}

        {/* Air flow particles */}
        {pipeProgress > 0.7 && airParticles.map(p => {
          const t = (frame + p.phase) % 60;
          const px = interpolate(t, [0, 60], [410, 410], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const py = interpolate(t, [0, 60], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const o = interpolate(t, [0, 10, 50, 60], [0, 0.6, 0.4, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={p.id} style={{
              position: "absolute", left: px + (p.id * 4) % 52, top: py,
              width: 6, height: 6, borderRadius: "50%",
              background: "rgba(180,220,255,0.7)", opacity: o,
            }} />
          );
        })}

        {/* Label: Belüftung */}
        <div style={{
          position: "absolute", top: 140, left: 320, opacity: label1Op,
          background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "6px 16px",
          border: "1px solid rgba(255,255,255,0.15)",
        }}>
          <div style={{ color: "#60a5fa", fontSize: 22, fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
            💨 Belüftungsrohr
          </div>
        </div>

        {/* === DRAINAGE === */}
        {/* Drainage channel along left wall */}
        <div style={{
          position: "absolute", bottom: 160, left: 160,
          width: 1600 * drainProgress, height: 30,
          background: "linear-gradient(180deg, #1a1208, #0d0906)",
          borderRadius: "0 0 8px 8px",
          boxShadow: "inset 0 3px 8px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}>
          {/* Water shimmer */}
          {Array.from({ length: 8 }, (_, i) => {
            const wx = (i * 200 + frame * 3) % 1600;
            return (
              <div key={i} style={{
                position: "absolute", left: wx, top: 4, width: 60, height: 14,
                background: "rgba(60,120,200,0.5)",
                borderRadius: 7,
                opacity: 0.6 + Math.sin(frame * 0.1 + i) * 0.3,
              }} />
            );
          })}
        </div>

        {/* Drain pipe exit in wall */}
        {drainProgress > 0.6 && (
          <div style={{
            position: "absolute", bottom: 155, left: 130, width: 36, height: 40,
            background: "linear-gradient(90deg, #0a0806, #1a1208)",
            borderRadius: "50% 0 0 50%",
            boxShadow: "inset 2px 0 8px rgba(0,0,0,0.8)",
          }} />
        )}

        {/* Water droplets */}
        {drainProgress > 0.5 && [0,1,2].map(i => {
          const wy = interpolate((frame + i * 10) % 30, [0, 25, 30], [155, 175, 175], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const wo = interpolate((frame + i * 10) % 30, [0, 5, 25, 30], [0, 0.9, 0.8, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{
              position: "absolute", left: 135 + i * 4, top: wy,
              width: 4, height: 8, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              background: "rgba(100,160,220,0.8)", opacity: wo,
            }} />
          );
        })}

        {/* Label: Entwässerung */}
        <div style={{
          position: "absolute", bottom: 185, left: 200, opacity: label2Op,
          background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: "6px 16px",
          border: "1px solid rgba(255,255,255,0.15)",
        }}>
          <div style={{ color: "#34d399", fontSize: 22, fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
            💧 Entwässerungsrinne
          </div>
        </div>

        {/* Torch light ambience */}
        <div style={{
          position: "absolute", top: 300, right: 260, width: 400, height: 400,
          background: "radial-gradient(ellipse, rgba(255,130,20,0.2) 0%, transparent 70%)",
        }} />
        <div style={{ position: "absolute", top: 310, right: 220, fontSize: 40 }}>🕯️</div>
      </div>

      <Grain opacity={0.065} />
      <Vignette strength={0.78} />
      <SceneTitle title="Belüftung & Drainage" sub="Kapitel 5 — Technik" />
      <Letterbox />
      <FadeBlack inFrames={20} outFrames={20} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
