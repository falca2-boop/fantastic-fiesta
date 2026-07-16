import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Narrator subtitles timed to match script sections
type Line = { from: number; to: number; text: string };

const LINES: Line[] = [
  { from: 30,   to: 200,  text: "Heute bauen wir Schritt für Schritt einen einfachen unterirdischen Schutzraum." },
  { from: 210,  to: 380,  text: "Zuerst markieren wir die Fläche und beginnen mit dem Aushub." },
  { from: 420,  to: 640,  text: "Im Zeitraffer: Die Baugrube nimmt Form an — Meter für Meter." },
  { from: 660,  to: 880,  text: "Regelmäßige Pausen einplanen. Handarbeit kostet Kraft." },
  { from: 900,  to: 1040, text: "Die Tiefe ist erreicht — rund zwei Meter." },
  { from: 1080, to: 1280, text: "Anschließend sichern wir die Wände mit Holzplanken und Natursteinen." },
  { from: 1300, to: 1480, text: "Jede Schicht wird sorgfältig gesetzt. Stabilität geht vor." },
  { from: 1500, to: 1610, text: "Die Konstruktion hält. Zeit für den Boden." },
  { from: 1650, to: 1850, text: "Wir legen den Boden aus und schichten flache Natursteine dicht an dicht." },
  { from: 1870, to: 2060, text: "Fugen werden verfüllt — ein sauberer, solider Boden entsteht." },
  { from: 2090, to: 2240, text: "Ein einfaches Belüftungsrohr sorgt für frische Luft." },
  { from: 2250, to: 2330, text: "Die Entwässerungsrinne leitet Feuchtigkeit nach außen ab." },
  { from: 2360, to: 2540, text: "Das Ergebnis ist ein kompakter, sauber gebauter unterirdischer Raum." },
  { from: 2560, to: 2700, text: "Funktional eingerichtet mit Beleuchtung, Sitzgelegenheit und Lagerfläche." },
];

export const NarratorBar: React.FC = () => {
  const frame = useCurrentFrame();

  const activeLine = LINES.find(l => frame >= l.from && frame <= l.to);
  if (!activeLine) return null;

  const lineProgress = frame - activeLine.from;
  const lineDuration = activeLine.to - activeLine.from;

  const opacity = interpolate(lineProgress, [0, 12, lineDuration - 12, lineDuration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const ty = interpolate(lineProgress, [0, 12], [8, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 136, zIndex: 96, pointerEvents: "none" }}>
      <div style={{
        opacity,
        translate: `0 ${ty}px`,
        maxWidth: 1400,
        textAlign: "center",
        padding: "0 60px",
      }}>
        {/* Subtle backing */}
        <div style={{
          display: "inline-block",
          background: "rgba(0,0,0,0.55)",
          borderRadius: 8,
          padding: "10px 28px",
        }}>
          <div style={{
            color: "#fff",
            fontFamily: "Arial, sans-serif",
            fontSize: 34,
            fontWeight: 400,
            lineHeight: 1.45,
            textShadow: "0 2px 12px rgba(0,0,0,0.95)",
            letterSpacing: 0.3,
          }}>
            {activeLine.text}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
