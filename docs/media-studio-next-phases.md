# AI Media Studio production scope and next phases

## Current production scope

- Image generation through Gemini and OpenArt
- Video generation where OpenArt MCP reports the required capability
- Text-to-speech through OpenAI Voice when `OPENAI_API_KEY` is configured
- Projects, Jobs, Media Library and Content Hub export
- Result previews and actions directly inside completed Jobs
- Partial loading: one failed endpoint no longer blanks all Media Studio data

## Voice Studio Pro

Voice Studio Pro is available at `/media-studio/voice` and uses the provider-neutral media architecture.

Production behavior:

- AI script creation, rewriting, shortening, expansion and translation through the shared AI fallback chain
- brand-aware script guidance without inventing property facts, prices, guarantees or credentials
- presets for premium property, business, social ads, audiobook, course and podcast narration
- language, built-in voice, tone/instructions, pause style, pronunciation guide and speed controls
- live word count and estimated duration
- estimated SRT and VTT subtitle downloads
- provider status and precise missing-configuration notice
- recent voice jobs and audio assets
- audio playback, download and Content Hub export
- provider: OpenAI Voice for actual text-to-speech
- default model: `gpt-4o-mini-tts`
- optional override: `OPENAI_TTS_MODEL`
- generated audio is persisted through `media_generation_jobs` and `media_assets`
- voice cloning remains disabled

Required production configuration for audio generation:

```text
OPENAI_API_KEY=server-side-key
# optional
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

The API key must never use a `NEXT_PUBLIC_` prefix. Without this key, AI script work and subtitle preparation remain available, while the final audio-generation action is disabled.

## Later Voice phases

- exact subtitle timing from the completed audio rather than estimated timing
- multi-segment and long-form narration beyond the 4096-character limit per speech request
- explicit linking of a voice asset to a selected video or avatar job
- dubbing and audio/video rendering in a durable worker environment
- optional custom voices only through an eligible provider account with recorded consent and a reviewed rights workflow

## Avatar Studio

Avatar controls must only be enabled when a connected provider reports one of:

- avatar creation
- consistent identity/avatar profile
- talking avatar

OpenArt website features must not be assumed to exist through the MCP connection. If OpenArt MCP does not expose avatar tools, add a separate official provider adapter before enabling the workflow.

A production avatar implementation must include:

- explicit rights and consent confirmation
- reference-asset persistence
- asynchronous job polling
- talking-avatar script and voice/audio input
- subtitle handling
- Media Library and Content Hub export
- no sensitive facial-attribute inference
