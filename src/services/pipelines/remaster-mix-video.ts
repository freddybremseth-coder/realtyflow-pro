import type { RemasterMixVideoV4Input, RemasterMixVideoV4Result } from "./remaster-mix-video-v4";

export type RemasterMixVideoInput = RemasterMixVideoV4Input;
export type RemasterMixVideoResult = RemasterMixVideoV4Result;

export {
  buildRemasterMixAssOverlay,
  buildRemasterMixGlobalAssOverlay,
  buildVisualConcatFile,
} from "./remaster-mix-video-compat";

export {
  renderRemasterLongFormMixV4 as renderRemasterLongFormMix,
  cleanupRemasterLongFormMixV4 as cleanupRemasterLongFormMix,
} from "./remaster-mix-video-v4";
