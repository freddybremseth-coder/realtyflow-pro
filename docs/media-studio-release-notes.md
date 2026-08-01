# AI Media Studio release notes

## Fixed

- Removed ambiguous PostgREST embeds between `media_assets` and `media_projects`.
- Restored existing generated images in Media Library.
- Restored auto-created projects in Projects.
- Changed Jobs to use persisted `result_assets_json`.
- Made client loading resilient so one failed endpoint does not blank the whole module.

## Added

- Result preview in completed Jobs.
- Image, video and audio playback/download actions.
- Direct Content Hub export from Jobs and Library.
- OpenAI Voice provider with server-side text-to-speech.
- Voice controls for language, built-in voice, tone, speed and output format.
- Voice assets stored through the existing Media Studio job/asset pipeline.
- Provider badge and capability reporting for OpenAI Voice.
- Additive Storage MIME-type migration and voice-over template.

## Intentionally unavailable

Avatar Studio remains disabled until an official connected provider reports avatar or talking-avatar capabilities. This prevents the UI from promising functionality that is not exposed by the current OpenArt MCP connection.
