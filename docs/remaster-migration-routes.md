# Re-Master Freddy Migration Routes

Re-Master Freddy is the user-facing admin surface for music publishing. RealtyFlow still owns the backend services listed here during the migration period.

Do not delete these routes, services, storage buckets or legacy brand records while Re-Master still depends on them.

## Required RealtyFlow API Routes

These routes are called by Re-Master serverless proxy functions:

| RealtyFlow route | Re-Master use |
| --- | --- |
| `/api/neural-beat` | Song queue, pipeline start and pipeline status proxy. |
| `/api/neural-beat/upload` | Signed MP3/image upload and song registration support. |
| `/api/neural-beat/image-bank` | Image bank list, upload registration, category filtering and delete. |
| `/api/neural-beat/analytics` | Re-Master channel analytics. |
| `/api/neural-beat/recommendations-safe` | Safe recommendations with history/duplicate status. |
| `/api/neural-beat/autopilot-settings` | Safe autopilot settings stored in `brand_settings.settings`. |
| `/api/neural-beat/autopilot-run` | Manual safe autopilot preview/planning. |
| `/api/youtube/status` | Brand-specific YouTube health and reconnect URL. |
| `/api/oauth/google` | Google/YouTube OAuth start. |
| `/api/oauth/google/callback` | Google/YouTube OAuth callback. |
| `/api/oauth/google/finalize` | Multi-channel Google/YouTube finalize. |
| `/api/oauth/pending` | Pending OAuth channel picker state. |

## Required Services

- `src/services/pipelines/neural-beat-pipeline.ts`
- `src/services/integrations/youtube-client.ts`
- `src/services/integrations/youtube-health.ts`
- `src/services/integrations/ffmpeg-renderer.ts`
- `src/services/integrations/gemini-client.ts`
- `src/services/integrations/thumbnail-composer.ts`
- `src/services/integrations/publish-time-picker.ts`
- `src/services/growth/remaster-action-history.ts`
- `src/services/growth/remaster-autopilot-settings.ts`
- `src/services/integrations/remaster-youtube-actions.ts`

## Required Data Contracts

Re-Master must continue to use the existing RealtyFlow Supabase project and schema.

Current required tables/settings:

- `brand_settings.settings.youtube_refresh_token`
- `brand_settings.settings.remaster_autopilot`
- `growth_actions`
- existing Neural Beat song/source records used by the pipeline
- existing Neural Beat image bank records
- existing YouTube OAuth tables/state rows

Current brand IDs:

- New writes should prefer `remasterfreddy`.
- Transitional reads must still support `neuralbeat`.
- Do not delete old `neuralbeat` data before a controlled migration is verified.

## OAuth Return Rules

Re-Master reconnects through RealtyFlow, but the user must return to Re-Master admin.

OAuth must use this same-origin return path:

```text
/oauth/remaster-return
```

The bridge forwards the OAuth result to the configured Re-Master admin URL. If
the custom domain is activated, set this RealtyFlow server env var:

```text
REMASTER_ADMIN_URL=https://remaster.freddybremseth.com/admin
```

The OAuth state guard must continue to reject absolute `return_to` URLs. The
public bridge forwards only the expected OAuth result parameters and prevents
the OAuth callback from becoming an open redirect.

## Old RealtyFlow Neural Beat Frontend

The old RealtyFlow Neural Beat page can confuse users because it still contains UI text around autopilot execution.

Safe cleanup target after Re-Master E2E has passed:

- remove or disable the old `Kjor Autopilot` button
- remove copy that implies mass execution still works
- show a clear message that Neural Beat administration moved to Re-Master Freddy
- link to `https://remasterfreddy.vercel.app/admin`
- keep all backend routes listed above
- keep all data
- keep `neuralbeat` compatibility until migration is verified

Backend guardrails already in place:

- legacy `POST /api/neural-beat/recommendations` is blocked in middleware
- safe manual recommendations use `/api/neural-beat/recommendations-safe`
- safe autopilot uses `/api/neural-beat/autopilot-run`
- `update_metadata` remains manual-only
