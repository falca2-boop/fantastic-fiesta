import { useCurrentFrame, interpolate } from "remotion";

// 2.35:1 letterbox on 1920×1080
const BAR_H = 117;

export const Letterbox: React.FC = () => (
  <>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: BAR_H, background: "#000", zIndex: 100 }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: BAR_H, background: "#000", zIndex: 100 }} />
  </>
);

// Grain overlay (deterministic per-frame pixel noise via SVG turbulence)
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.045 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 90, pointerEvents: "none",
      opacity,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' seed='${frame % 60}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: "200px 200px",
      mixBlendMode: "overlay",
    }} />
  );
};

// Vignette
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.6 }) => (
  <div style={{
    position: "absolute", inset: 0, zIndex: 89, pointerEvents: "none",
    background: `radial-gradient(ellipse 80% 75% at 50% 50%, transparent 40%, rgba(0,0,0,${strength}) 100%)`,
  }} />
);

// Scene title overlay
export const SceneTitle: React.FC<{ title: string; sub?: string; fromFrame?: number }> = ({
  title, sub, fromFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const t = frame - fromFrame;
  const opacity = interpolate(t, [0, 20, 80, 100], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const y = interpolate(t, [0, 20], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", bottom: 140, left: 80,
      opacity, translate: `0 ${y}px`,
      zIndex: 95,
    }}>
      <div style={{
        color: "#fff",
        fontFamily: "Arial Narrow, Arial, sans-serif",
        fontSize: 28, fontWeight: 700, letterSpacing: 4,
        textTransform: "uppercase",
        textShadow: "0 2px 16px rgba(0,0,0,0.9)",
        opacity: 0.75,
      }}>{sub}</div>
      <div style={{
        color: "#fff",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 52, fontWeight: 900,
        textShadow: "0 3px 24px rgba(0,0,0,0.85)",
        lineHeight: 1.1,
        letterSpacing: -1,
      }}>{title}</div>
    </div>
  );
};

// Fade to/from black
export const FadeBlack: React.FC<{ inFrames?: number; outFrames?: number; totalFrames: number }> = ({
  inFrames = 20, outFrames = 20, totalFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, inFrames, totalFrames - outFrames, totalFrames],
    [1, 0, 0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  if (opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", opacity, zIndex: 98, pointerEvents: "none" }} />
  );
};

// Tree silhouette SVG
export const Tree: React.FC<{ x: number; h: number; color?: string; trunk?: string }> = ({
  x, h, color = "#1a3010", trunk = "#3d2010",
}) => (
  <g transform={`translate(${x}, 0)`}>
    <rect x={-8} y={-30} width={16} height={30 + h * 0.15} fill={trunk} />
    <ellipse cx={0} cy={-h * 0.85} rx={h * 0.28} ry={h * 0.52} fill={color} />
    <ellipse cx={-h * 0.15} cy={-h * 0.6} rx={h * 0.22} ry={h * 0.38} fill={color} opacity={0.85} />
    <ellipse cx={h * 0.18} cy={-h * 0.55} rx={h * 0.2} ry={h * 0.35} fill={color} opacity={0.8} />
  </g>
);
