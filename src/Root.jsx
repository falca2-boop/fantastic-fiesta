import { Composition } from 'remotion';
import { JarvisVideo } from './JarvisVideo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="JarvisVideo"
      component={JarvisVideo}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
