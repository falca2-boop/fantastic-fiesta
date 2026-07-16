import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  staticFile,
  continueRender,
  cancelRender,
  delayRender,
} from "remotion";
import { Audio } from "@remotion/media";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { CaptionPage } from "./CaptionPage";
import { IntroScene } from "./scenes/IntroScene";
import { MaterialsScene } from "./scenes/MaterialsScene";
import { MeasureScene } from "./scenes/MeasureScene";
import { DrillScene } from "./scenes/DrillScene";
import { AssembleScene } from "./scenes/AssembleScene";
import { PaintScene } from "./scenes/PaintScene";
import { OutroScene } from "./scenes/OutroScene";

const SWITCH_MS = 1500;

// Scene timing at 30fps:
// 0–90     Intro       (0–3s)
// 90–240   Materials   (3–8s)
// 240–570  Measure     (8–19s)
// 570–840  Drill       (19–28s)
// 840–1230 Assemble    (28–41s)
// 1230–1560 Paint      (41–52s)
// 1560–1800 Outro      (52–60s)
const SCENES = [
  { from: 0,    duration: 90,  component: IntroScene },
  { from: 90,   duration: 150, component: MaterialsScene },
  { from: 240,  duration: 330, component: MeasureScene },
  { from: 570,  duration: 270, component: DrillScene },
  { from: 840,  duration: 390, component: AssembleScene },
  { from: 1230, duration: 330, component: PaintScene },
  { from: 1560, duration: 240, component: OutroScene },
];

// DIY badge shown throughout
const DIYBadge: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 100, pointerEvents: "none" }}>
    <div style={{
      background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
      borderRadius: 16, padding: "12px 32px",
      fontSize: 42, fontWeight: 900, color: "#fff",
      fontFamily: "Arial Black, Arial, sans-serif",
      letterSpacing: 2,
      boxShadow: "0 8px 32px rgba(255,63,0,0.4)",
    }}>
      🔨 DIY
    </div>
  </AbsoluteFill>
);

export const DIYVideo: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { fps } = useVideoConfig();
  const [handle] = useState(() => delayRender());

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("captions.json"));
      const data = await response.json();
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [handle]);

  useEffect(() => { fetchCaptions(); }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] };
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: SWITCH_MS });
  }, [captions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a", overflow: "hidden" }}>
      {/* Background music */}
      <Audio src={staticFile("bgmusic.wav")} volume={0.55} />

      {/* Scenes */}
      {SCENES.map(({ from, duration, component: Scene }, i) => (
        <Sequence key={i} from={from} durationInFrames={duration} name={Scene.name}>
          <Scene />
        </Sequence>
      ))}

      {/* DIY badge always visible */}
      <DIYBadge />

      {/* Captions overlay */}
      {captions && pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_MS / 1000) * fps
        );
        const durationInFrames = Math.round(endFrame - startFrame);
        if (durationInFrames <= 0) return null;

        return (
          <Sequence
            key={index}
            name={`Caption ${index + 1}`}
            from={Math.round(startFrame)}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} />
          </Sequence>
        );
      })}

      {/* Home indicator */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 24, pointerEvents: "none" }}>
        <div style={{ width: 120, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.3)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
