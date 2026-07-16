import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

export const PaintScene: React.FC = () => {
  const frame = useCurrentFrame();

  const intro = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [290, 330], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Brush sweeps left to right
  const brushX = interpolate(
    frame,
    [30, 79, 81, 129, 131, 179, 181, 230],
    [100, 780, 780, 100, 100, 780, 780, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.4, 0, 0.6, 1) }
  );
  const brushRow = interpolate(frame, [30, 230], [0, 3], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // Paint coverage grows
  const paint1 = interpolate(frame, [30, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const paint2 = interpolate(frame, [80, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const paint3 = interpolate(frame, [130, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Sheen effect
  const sheenX = interpolate(frame, [180, 280], [-1200, 1200], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });

  const resultOpacity = interpolate(frame, [230, 260], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const SHELF_BG = "linear-gradient(180deg, #DEB887, #A0784A)";
  const LACQUER = "rgba(255,220,100,0.18)";

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#10080e", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(200,80,200,0.1) 0%, transparent 65%)",
      }} />

      <div style={{
        position: "absolute", top: 110, left: 60, opacity: intro,
        background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
        borderRadius: 14, padding: "10px 28px",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 36, fontWeight: 900, color: "#fff",
        boxShadow: "0 6px 24px rgba(255,63,0,0.4)",
      }}>
        Schritt 4 🖌️
      </div>

      <div style={{
        position: "absolute", top: 195, left: 60, right: 60, opacity: intro,
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 64, fontWeight: 900, color: "#fff",
        textShadow: "0 4px 20px rgba(0,0,0,0.8)",
      }}>
        Schleifen &{"\n"}Lackieren
      </div>

      {/* Shelf to be painted */}
      <div style={{
        position: "absolute", top: 430, left: 60, right: 60,
        borderRadius: 12,
        background: SHELF_BG,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        {/* Shelf structure */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 60, borderBottom: "1px solid rgba(0,0,0,0.2)", position: "relative", overflow: "hidden" }}>
            {/* Lacquer layer */}
            <div style={{
              position: "absolute", inset: 0,
              background: LACQUER,
              opacity: [paint1, paint2, paint3][i],
            }} />
            {/* Sheen */}
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)`,
              translate: `${sheenX}px 0`,
              opacity: [paint1, paint2, paint3][i],
            }} />
          </div>
        ))}
      </div>

      {/* Paintbrush */}
      <div style={{
        position: "absolute",
        top: 415 + Math.round(brushRow) * 60,
        left: brushX,
        fontSize: 60,
        rotate: "90deg",
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
        transition: "top 0.05s",
      }}>
        🖌️
      </div>

      {/* Result */}
      <div style={{
        position: "absolute", bottom: 100, left: 60, right: 60,
        opacity: resultOpacity,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "16px 24px",
        border: "1px solid rgba(255,255,255,0.12)",
      }}>
        <div style={{ color: "#FFE500", fontSize: 34, fontWeight: 700, fontFamily: "Arial Black, Arial, sans-serif" }}>
          ✨ Klarlack matt — 2 Schichten
        </div>
        <div style={{ color: "#94a3b8", fontSize: 26, marginTop: 6 }}>
          Zwischen den Schichten trocknen lassen
        </div>
      </div>
    </AbsoluteFill>
  );
};
