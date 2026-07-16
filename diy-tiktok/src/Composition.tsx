import { Composition } from "remotion";
import { DIYVideo } from "./DIYVideo";

// 9:16 TikTok format, 30fps, 10 seconds
export const MyComposition = () => {
  return (
    <Composition
      id="DIYTikTok"
      component={DIYVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
