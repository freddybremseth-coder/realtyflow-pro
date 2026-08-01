# AI Media Studio next phases

## Current production scope

- Image generation through Gemini and OpenArt
- Video generation where OpenArt MCP reports the required capability
- Projects, Jobs, Media Library and Content Hub export

## Avatar Studio

Avatar controls must only be enabled when a connected provider reports one of:

- avatar creation
- consistent identity/avatar profile
- talking avatar

OpenArt website features must not be assumed to exist through the MCP connection. If OpenArt MCP does not expose avatar tools, add a separate provider adapter before enabling the workflow.

## Voice Studio

Voice controls must only be enabled when a connected provider reports text-to-speech. Voice cloning requires separate explicit consent and provider support.

Recommended provider-neutral interfaces already exist in the Media Studio design. A later implementation should add a provider adapter, job persistence, asset persistence, consent handling and Content Hub export before marking these modules available.

## UX follow-up

Completed Jobs should render their `result_assets_json` previews and actions directly. Library remains the canonical asset view.
