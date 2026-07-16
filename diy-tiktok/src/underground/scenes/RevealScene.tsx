import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Letterbox, Grain, Vignette, FadeBlack } from "../Cinematic";

// 2340–2700 (12s) — Fertiger Raum: Beleuchtung, Sitz, Lager

export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TOTAL = 360;

  // Camera dolly forward (zoom in)
  const camScale = interpolate(frame, [0, TOTAL], [0.95, 1.08], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  });

  // Lights turn on sequentially
  const light1 = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const light2 = interpolate(frame, [70, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const light3 = interpolate(frame, [110, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Items appear with stagger
  const benchOpacity = interpolate(frame, [160, 190], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const benchY = interpolate(frame, [160, 190], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const shelfOpacity = interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shelfY = interpolate(frame, [200, 230], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const itemsOpacity = interpolate(frame, [240, 270], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Title card at end
  const titleOpacity = interpolate(frame, [280, 310, 340, 360], [0, 1, 1, 0.7], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Warm flicker for bulbs
  const flicker1 = 0.88 + Math.sin(frame * 0.23) * 0.06 + Math.sin(frame * 0.71) * 0.04;
  const flicker2 = 0.92 + Math.sin(frame * 0.31 + 1) * 0.05;
  const flicker3 = 0.9 + Math.sin(frame * 0.19 + 2) * 0.07;

  return (
    <AbsoluteFill style={{ background: "#08060410", overflow: "hidden" }}>
      <div style={{
        position: "absolute", inset: 0,
        scale: String(camScale), transformOrigin: "center 60%",
      }}>
        {/* === ROOM SHELL === */}
        {/* Ceiling with planks */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 180,
          background: "#120d08",
        }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{
              position: "absolute", left: i * 244, top: 15, width: 228, height: 60,
              background: "linear-gradient(180deg, #B89050, #7A5028)",
              borderRight: "6px solid rgba(0,0,0,0.5)",
            }} />
          ))}
        </div>

        {/* Back wall - stone */}
        <div style={{
          position: "absolute", top: 180, left: 200, right: 200, height: 500,
          background: "linear-gradient(180deg, #2a2018, #1a1510)",
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(5, 1fr)",
          gap: 5, padding: 6,
        }}>
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} style={{
              background: `hsl(${25 + (i * 11) % 18}, ${8 + (i * 5) % 8}%, ${18 + (i * 7) % 14}%)`,
              borderRadius: "4px 6px 3px 5px / 5px 3px 6px 4px",
              boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.04)",
            }} />
          ))}
        </div>

        {/* Side walls - wood planks */}
        {[{ side: "left" as const, x: 0, w: 200 }, { side: "right" as const, x: 1720, w: 200 }].map(({ side, x, w }) => (
          <div key={side} style={{
            position: "absolute", top: 180, left: x, width: w, bottom: 0,
            background: "#0f0c08",
          }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{
                position: "absolute", top: i * 108, left: 0, right: 0, height: 100,
                background: `linear-gradient(180deg, #C8A060, #8A5C28)`,
                borderBottom: "6px solid rgba(0,0,0,0.6)",
              }}>
                {[12, 28, 44, 60, 76].map(gy => (
                  <div key={gy} style={{
                    position: "absolute", top: gy, left: 0, right: 0, height: 1,
                    background: "rgba(60,30,5,0.25)",
                  }} />
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Floor */}
        <div style={{
          position: "absolute", bottom: 0, left: 200, right: 200, height: 200,
          display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridTemplateRows: "repeat(3, 1fr)",
          gap: 4, padding: 5, background: "#0f0c08",
        }}>
          {Array.from({ length: 36 }, (_, i) => (
            <div key={i} style={{
              background: `hsl(${22 + (i * 9) % 12}, ${10 + (i * 3) % 8}%, ${26 + (i * 7) % 18}%)`,
              borderRadius: 3,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3)",
            }} />
          ))}
        </div>

        {/* === LIGHTS === */}
        {[
          { x: 480, brightness: light1, flicker: flicker1 },
          { x: 960, brightness: light2, flicker: flicker2 },
          { x: 1440, brightness: light3, flicker: flicker3 },
        ].map(({ x, brightness, flicker }, i) => (
          <g key={i}>
            {/* Glow pool on ceiling */}
            <div style={{
              position: "absolute", top: 0, left: x - 200, width: 400, height: 300,
              background: `radial-gradient(ellipse at 50% 0%, rgba(255,200,60,${0.35 * brightness * flicker}) 0%, transparent 70%)`,
            }} />
            {/* Bulb casing */}
            <div style={{
              position: "absolute", top: 155, left: x - 10, width: 20, height: 30,
              background: "#606060", borderRadius: "0 0 4px 4px",
              boxShadow: `0 0 ${30 * brightness}px rgba(255,200,60,${0.8 * brightness * flicker})`,
            }}>
              <div style={{
                position: "absolute", top: 6, left: "50%", translate: "-50% 0",
                width: 14, height: 14, borderRadius: "50%",
                background: `rgba(255,230,120,${brightness * flicker})`,
                boxShadow: `0 0 ${20 * brightness}px rgba(255,220,80,${brightness})`,
              }} />
            </div>
            {/* Light cone */}
            <div style={{
              position: "absolute", top: 185, left: x - 280, width: 560, height: 600,
              background: `linear-gradient(180deg, rgba(255,200,60,${0.18 * brightness * flicker}) 0%, transparent 85%)`,
              clipPath: "polygon(28% 0%, 72% 0%, 100% 100%, 0% 100%)",
              opacity: brightness,
            }} />
          </g>
        ))}

        {/* === FURNITURE === */}
        {/* Bench/seat */}
        <div style={{
          position: "absolute", bottom: 195, left: 250,
          opacity: benchOpacity, translate: `0 ${benchY}px`,
        }}>
          {/* Legs */}
          {[0, 160].map(lx => (
            <div key={lx} style={{
              position: "absolute", left: lx, bottom: 0, width: 18, height: 80,
              background: "linear-gradient(180deg, #8A5C28, #5A3C18)",
            }} />
          ))}
          {/* Seat */}
          <div style={{
            position: "absolute", bottom: 78, left: 0, width: 180, height: 24,
            background: "linear-gradient(180deg, #DEB887, #A07840)",
            borderRadius: 3,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }} />
          {/* Backrest */}
          <div style={{
            position: "absolute", bottom: 78, left: 0, width: 180, height: 80,
            borderLeft: "18px solid #A07840",
            borderTop: "14px solid #A07840",
            background: "transparent",
            borderRadius: "2px 0 0 0",
          }} />
          <div style={{ position: "absolute", bottom: 130, left: 60, fontSize: 28 }}>🎒</div>
        </div>

        {/* Shelf on back wall */}
        <div style={{
          position: "absolute", top: 300, left: "50%",
          opacity: shelfOpacity, translate: `-50% ${shelfY}px`,
          width: 500,
        }}>
          {/* Side boards */}
          {[0, 460].map(x => (
            <div key={x} style={{
              position: "absolute", left: x, top: 0, width: 40, height: 280,
              background: "linear-gradient(180deg, #DEB887, #A07840)",
              borderRadius: 4,
            }} />
          ))}
          {/* Shelves */}
          {[0, 110, 220].map((y, i) => (
            <div key={i} style={{
              position: "absolute", left: 40, right: 40, top: y, height: 28,
              background: "linear-gradient(180deg, #DEB887, #A07840)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }} />
          ))}
        </div>

        {/* Items on shelf */}
        <div style={{ opacity: itemsOpacity }}>
          <div style={{ position: "absolute", top: 310, left: "50%", translate: "-35% 0", fontSize: 30 }}>🥫</div>
          <div style={{ position: "absolute", top: 308, left: "50%", translate: "10% 0", fontSize: 28 }}>🔦</div>
          <div style={{ position: "absolute", top: 306, left: "50%", translate: "55% 0", fontSize: 26 }}>🧰</div>
          <div style={{ position: "absolute", top: 418, left: "50%", translate: "-50% 0", fontSize: 30 }}>💧</div>
          <div style={{ position: "absolute", top: 415, left: "50%", translate: "30% 0", fontSize: 28 }}>🥫</div>
        </div>

        {/* Torch on side wall */}
        <div style={{ position: "absolute", top: 340, left: 205, fontSize: 38 }}>🕯️</div>
        <div style={{
          position: "absolute", top: 280, left: 165, width: 300, height: 300,
          background: "radial-gradient(ellipse at 0% 30%, rgba(255,130,30,0.2) 0%, transparent 70%)",
        }} />

        {/* Entrance shadow hint */}
        <div style={{
          position: "absolute", top: 0, left: 1560, right: 0, bottom: 0,
          background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.6))",
        }} />
        <div style={{
          position: "absolute", top: 220, right: 120, width: 200, height: 400,
          background: "#08060422",
          borderRadius: "50% 50% 0 0",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.9)",
        }} />
      </div>

      {/* FINAL TITLE */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        opacity: titleOpacity, zIndex: 92, pointerEvents: "none",
      }}>
        <div style={{
          background: "rgba(0,0,0,0.6)",
          borderRadius: 20, padding: "40px 80px",
          backdropFilter: "blur(2px)",
          border: "1px solid rgba(255,200,60,0.2)",
          textAlign: "center",
        }}>
          <div style={{
            color: "#FFE500",
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: 72, fontWeight: 900,
            textShadow: "0 0 40px rgba(255,229,0,0.4)",
          }}>Fertig! ✓</div>
          <div style={{
            color: "rgba(255,255,255,0.85)",
            fontFamily: "Arial, sans-serif",
            fontSize: 30, marginTop: 12,
            letterSpacing: 1,
          }}>Kompakter unterirdischer Schutzraum</div>
        </div>
      </div>

      <Grain opacity={0.05} />
      <Vignette strength={0.65} />
      <Letterbox />
      <FadeBlack inFrames={25} outFrames={40} totalFrames={TOTAL} />
    </AbsoluteFill>
  );
};
