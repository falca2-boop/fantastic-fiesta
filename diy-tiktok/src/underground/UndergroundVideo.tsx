import { AbsoluteFill, Sequence } from "remotion";
import { DroneScene } from "./scenes/DroneScene";
import { DiggingScene } from "./scenes/DiggingScene";
import { WallScene } from "./scenes/WallScene";
import { FloorScene } from "./scenes/FloorScene";
import { VentScene } from "./scenes/VentScene";
import { RevealScene } from "./scenes/RevealScene";
import { NarratorBar } from "./NarratorBar";

// Total: 2700 frames = 90 seconds @ 30fps (cinematic 1920×1080)
//
// Scene timing:
// 0–390    DroneScene   (13s) — Aerial forest + marking
// 390–1050 DiggingScene (22s) — Timelapse excavation
// 1050–1620 WallScene   (19s) — Wood & stone walls
// 1620–2070 FloorScene  (15s) — Stone floor laying
// 2070–2340 VentScene   (9s)  — Ventilation & drainage
// 2340–2700 RevealScene (12s) — Finished room reveal

const SCENES = [
  { from: 0,    duration: 390,  component: DroneScene },
  { from: 390,  duration: 660,  component: DiggingScene },
  { from: 1050, duration: 570,  component: WallScene },
  { from: 1620, duration: 450,  component: FloorScene },
  { from: 2070, duration: 270,  component: VentScene },
  { from: 2340, duration: 360,  component: RevealScene },
];

export const UndergroundVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
    {SCENES.map(({ from, duration, component: Scene }, i) => (
      <Sequence key={i} from={from} durationInFrames={duration} name={Scene.name}>
        <Scene />
      </Sequence>
    ))}
    <NarratorBar />
  </AbsoluteFill>
);
