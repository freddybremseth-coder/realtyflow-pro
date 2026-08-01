# AI Media Studio OpenArt Capabilities

AI Media Studio must not assume OpenArt web-app features are available through MCP. Capabilities are derived from the connected account's `tools/list` response and stored in `media_provider_capabilities`.

## Runtime Capture

Use either:

- `POST /api/media/openart/refresh-capabilities`
- `GET /api/media/providers/capabilities?refresh=openart`

The refresh flow:

1. Reads the encrypted OpenArt OAuth tokens from `openart_connection`.
2. Refreshes the token when needed.
3. Opens a fresh MCP session.
4. Calls `tools/list`.
5. Maps tool names into provider-neutral capabilities.
6. Stores the raw tool summaries in `media_provider_capabilities.tools_json`.
7. Stores mapped booleans in `media_provider_capabilities.capabilities_json`.

## Local Capture Result

Captured during this implementation: not available.

Reason: this working copy only has `.env.example`; the local environment is missing `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_ENCRYPTION_KEY`, and a live OpenArt OAuth connection. Because of that, there is no trustworthy `tools/list` response to record from this machine.

No capabilities were invented from the OpenArt website.

## Code-Known MCP Wrappers

The existing OpenArt client has wrappers for these MCP tool names:

- `openart_account_get`
- `openart_generate_image`
- `openart_generate_video`
- `openart_creation_get`

These names are implementation wrappers, not a substitute for a fresh `tools/list` result. The capability registry still refreshes from MCP at runtime before enabling OpenArt-specific features.

## Expected Stored Shape

`media_provider_capabilities.tools_json` stores rows like:

```json
[
  {
    "name": "openart_generate_image",
    "description": "Provider-supplied description"
  }
]
```

`media_provider_capabilities.capabilities_json` stores:

```json
{
  "image": {
    "textToImage": true,
    "imageToImage": true,
    "inpainting": false,
    "outpainting": false,
    "upscaling": false,
    "backgroundRemoval": false
  },
  "video": {
    "textToVideo": true,
    "imageToVideo": true,
    "audioGeneration": false
  },
  "avatar": {
    "avatarCreation": false,
    "talkingAvatar": false
  },
  "voice": {
    "textToSpeech": false,
    "voiceClone": false
  }
}
```

The booleans above are examples of the stored shape only. Production values must come from the latest `tools/list` refresh.

## Verification Query

After connecting OpenArt and refreshing capabilities:

```sql
select
  provider,
  status,
  updated_at,
  tools_json,
  capabilities_json,
  error_message
from public.media_provider_capabilities
where provider = 'openart'
order by updated_at desc
limit 1;
```

## UI Behavior

- Image and video actions use OpenArt only when the mapped capability is available.
- Avatar and voice shells remain inactive unless OpenArt or another provider reports support.
- If OpenArt is not connected, the Settings view prompts for capability refresh and shows `not_connected`.
- If a capability disappears, routing falls back to Gemini where possible or returns a clear provider unsupported message.
