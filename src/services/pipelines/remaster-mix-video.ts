import type { RemasterMixVideoV3Input, RemasterMixVideoV3Result } from "./remaster-mix-video-v3";

export type RemasterMixVideoInput = RemasterMixVideoV3Input;
export type RemasterMixVideoResult = RemasterMixVideoV3Result;

export {
  buildRemasterMixAssOverlay,
  buildRemasterMixGlobalAssOverlay,
  buildVisualConcatFile,
} from "./remaster-mix-video-compat";

export {
  renderRemasterLongFormMixV3 as renderRemasterLongFormMix,
  cleanupRemasterLongFormMixV3 as cleanupRemasterLongFormMix,
} from "./remaster-mix-video-v3";
