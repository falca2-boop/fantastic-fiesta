import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  Easing,
  continueRender,
  cancelRender,
  delayRender,
} from "remotion";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { CaptionPage } from "./CaptionPage";

const SWITCH_CAPTIONS_EVERY_MS = 1500;

const Background: React.FC = () => {
  const frame = useCurrentFrame();

  const gradientShift = interpolate(frame, [0, 300], [0, 20], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.6, 1),
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${135 + gradientShift}deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)`,
      }}
    />
  );
};

const DIYLabel: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const translateY = interpolate(frame, [0, 20], [-20, 0], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: 100,
      }}
    >
      <div
        style={{
          opacity,
          translate: `0px ${translateY}px`,
          background: "linear-gradient(135deg, #FF6B35, #FF3F00)",
          borderRadius: 16,
          padding: "12px 32px",
          fontSize: 42,
          fontWeight: 900,
          color: "#fff",
          fontFamily: "Arial Black, Arial, sans-serif",
          letterSpacing: 2,
          boxShadow: "0 8px 32px rgba(255,63,0,0.4)",
        }}
      >
        🔨 DIY
      </div>
    </AbsoluteFill>
  );
};

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

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] };
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
    });
  }, [captions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }}>
      <Background />
      <DIYLabel />

      {captions && (
        <AbsoluteFill>
          {pages.map((page, index) => {
            const nextPage = pages[index + 1] ?? null;
            const startFrame = (page.startMs / 1000) * fps;
            const endFrame = Math.min(
              nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
              startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps
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
        </AbsoluteFill>
      )}

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 60,
        }}
      >
        <div
          style={{
            width: 80,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.3)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
