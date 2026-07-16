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
import { Video } from "@remotion/media";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { CaptionPage } from "./CaptionPage";

const SWITCH_MS = 1500;

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
        pointerEvents: "none",
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

// Dark overlay so captions stay readable over any video
const VideoOverlay: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.55) 100%)",
    }}
  />
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

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] };
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_MS,
    });
  }, [captions]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f1923" }}>
      {/* Background video — loop so it fills the full 60s */}
      <Video
        src={staticFile("video.mp4")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        loop
        muted
      />

      {/* Gradient overlay for readability */}
      <VideoOverlay />

      {/* DIY badge */}
      <DIYLabel />

      {/* Captions */}
      {captions && (
        <AbsoluteFill>
          {pages.map((page, index) => {
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
        </AbsoluteFill>
      )}

      {/* Bottom home indicator */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 24,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 120,
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,0.4)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
