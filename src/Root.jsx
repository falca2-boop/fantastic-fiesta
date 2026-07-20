import { Composition, registerRoot } from 'remotion';
import { JarvisVideo } from './JarvisVideo';
import { DroneVideo } from './DroneVideo';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="JarvisVideo"
        component={JarvisVideo}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="DroneVideo"
        component={DroneVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

registerRoot(RemotionRoot);
