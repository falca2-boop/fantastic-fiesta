import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";

const HIGHLIGHT_COLOR = "#FFE500";
const TEXT_COLOR = "#FFFFFF";

export const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 160,
        paddingLeft: 40,
        paddingRight: 40,
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          whiteSpace: "pre",
          textAlign: "center",
          lineHeight: 1.2,
          textShadow: "0 4px 16px rgba(0,0,0,0.7)",
          fontFamily: "Arial Black, Arial, sans-serif",
          flexWrap: "wrap",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {page.tokens.map((token) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          return (
            <span
              key={token.fromMs}
              style={{
                color: isActive ? HIGHLIGHT_COLOR : TEXT_COLOR,
                transition: "none",
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
