import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";

const items = [
  { icon: "🪵", label: "Holzbretter", sub: "80 × 30 cm" },
  { icon: "🔩", label: "Schrauben", sub: "4 mm × 40 mm" },
  { icon: "🔧", label: "Akkuschrauber", sub: "inkl. Bits" },
  { icon: "📏", label: "Maßband", sub: "& Bleistift" },
  { icon: "🪚", label: "Stichsäge", sub: "oder Handkreissäge" },
];

const MaterialItem: React.FC<{ icon: string; label: string; sub: string; delay: number }> = ({
  icon, label, sub, delay,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const x = interpolate(frame, [delay, delay + 18], [-60, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div style={{
      opacity, translate: `${x}px 0`,
      display: "flex", alignItems: "center", gap: 22,
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20, padding: "18px 28px",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ fontSize: 52 }}>{icon}</div>
      <div>
        <div style={{ color: "#fff", fontSize: 38, fontWeight: 800, fontFamily: "Arial Black, Arial, sans-serif" }}>
          {label}
        </div>
        <div style={{ color: "#F4A460", fontSize: 28, fontWeight: 600, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
};

export const MaterialsScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(frame, [125, 150], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity, background: "#120a00", overflow: "hidden" }}>
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(180,100,20,0.2) 0%, transparent 60%)",
      }} />

      <AbsoluteFill style={{
        flexDirection: "column", padding: "120px 60px 80px",
        justifyContent: "flex-start", gap: 28,
      }}>
        {/* Header */}
        <div style={{ opacity: titleOpacity, marginBottom: 12 }}>
          <div style={{
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: 44, fontWeight: 900, color: "#F4A460",
            letterSpacing: 2, textTransform: "uppercase",
          }}>
            Du brauchst:
          </div>
        </div>

        {/* Items */}
        {items.map((item, i) => (
          <MaterialItem key={i} {...item} delay={i * 18 + 12} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
