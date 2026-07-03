import React from "react";
import { AbsoluteFill, Audio, staticFile, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import {
  COLORS, CROSSFADE, FPS, SCENE_DURATIONS, AUDIO_DURATIONS, AUDIO_FILES,
} from "./constants";
import { Subtitles } from "./Subtitles";
import { Hook } from "./scenes/Hook";
import { Capital } from "./scenes/Capital";
import { Privacy } from "./scenes/Privacy";
import { Solution } from "./scenes/Solution";
import { Flow } from "./scenes/Flow";
import { Guarantee } from "./scenes/Guarantee";
import { Proof } from "./scenes/Proof";
import { Close } from "./scenes/Close";

// GAP mode: audio fades in over crossfade, sustains, fades out over last 1s of AUDIO (not scene) duration.
const SceneAudio: React.FC<{ src: string; audioDuration: number }> = ({ src, audioDuration }) => (
  <Audio
    src={staticFile(src)}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, CROSSFADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const fadeOut = interpolate(f, [audioDuration - FPS, audioDuration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return Math.min(fadeIn, fadeOut, 1);
    }}
  />
);

const scenes = [
  { id: "hook", Component: Hook },
  { id: "capital", Component: Capital },
  { id: "privacy", Component: Privacy },
  { id: "solution", Component: Solution },
  { id: "flow", Component: Flow },
  { id: "guarantee", Component: Guarantee },
  { id: "proof", Component: Proof },
  { id: "close", Component: Close },
] as const;

export const MainVideo: React.FC = () => {
  const transition = linearTiming({ durationInFrames: CROSSFADE });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const dur = SCENE_DURATIONS[scene.id as keyof typeof SCENE_DURATIONS];
          const audioDur = AUDIO_DURATIONS[scene.id as keyof typeof AUDIO_DURATIONS];
          const els: React.ReactNode[] = [
            <TransitionSeries.Sequence key={scene.id} durationInFrames={dur}>
              <scene.Component />
              <SceneAudio src={AUDIO_FILES[scene.id as keyof typeof AUDIO_FILES]} audioDuration={audioDur} />
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            els.push(
              <TransitionSeries.Transition key={`t-${scene.id}`} presentation={fade()} timing={transition} />
            );
          }
          return els;
        })}
      </TransitionSeries>
      <Subtitles />
    </AbsoluteFill>
  );
};
