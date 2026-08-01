# AI Media Studio production scope and next phases

## Current production scope

- Image generation through Gemini and OpenArt
- Video generation where OpenArt MCP reports the required capability
- Text-to-speech through OpenAI Voice when `OPENAI_API_KEY` is configured
- Projects, Jobs, Media Library and Content Hub export
- Result previews and actions directly inside completed Jobs
- Partial loading: one failed endpoint no longer blanks all Media Studio data

## Voice Studio

Voice Studio is implemented through the provider-neutral media architecture.

Production behavior:

- provider: OpenAI Voice
- default model: `gpt-4o-mini-tts`
- optional override: `OPENAI_TTS_MODEL`
- supported controls: script, language, built-in voice, tone/instructions, speed and output format
- generated audio is persisted through `media_generation_jobs` and `media_assets`
- audio can be played, downloaded and exported to Content Hub
- voice cloning remains disabled

Required production configuration:

```text
OPENAI_API_KEY=server-side-key
# optional
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

The API key must never use a `NEXT_PUBLIC_` prefix.

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
