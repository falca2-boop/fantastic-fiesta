import { Composition } from "remotion";
import { DIYVideo } from "./DIYVideo";
import { UndergroundVideo } from "./underground/UndergroundVideo";

export const MyComposition = () => (
  <>
    {/* TikTok 9:16, 60s */}
    <Composition
      id="DIYTikTok"
      component={DIYVideo}
      durationInFrames={1800}
      fps={30}
      width={1080}
      height={1920}
    />
    {/* Cinematic 16:9, 90s */}
    <Composition
      id="UnterirdischerRaum"
      component={UndergroundVideo}
      durationInFrames={2700}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
