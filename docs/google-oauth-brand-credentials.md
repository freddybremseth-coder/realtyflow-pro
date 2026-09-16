# Brand-scoped Google OAuth credentials

RealtyFlow supports optional brand-specific Google OAuth credentials for Google Workspace integrations that should be isolated from the global Google/YouTube OAuth app.

For brand `soleada`, configure these deployment environment variables:

- `SOLEADA_GOOGLE_CLIENT_ID`
- `SOLEADA_GOOGLE_CLIENT_SECRET`

When both are present, Google OAuth started for `brand_id=soleada` uses those credentials for authorization, callback token exchange, and refresh-token renewal. Other brands continue to use the global `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` credentials, with the historical `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` fallback.

A partial override is rejected so RealtyFlow can never combine one brand-specific value with one global value.

## Google Workspace Internal app

If Soleada's Google Cloud project is owned by the same Google Workspace organization as `freddy@soleada.no`, configure the Google Auth Platform audience as **Internal**. Create a Web application OAuth client and register RealtyFlow's canonical redirect URI:

`<NEXT_PUBLIC_APP_URL>/api/oauth/google/callback`

Add the resulting client ID and client secret to the two Soleada environment variables above. Never commit client secrets to source control.

The Gmail connection continues to request the scope required for IMAP/SMTP XOAUTH2 and verifies the exact mailbox identity before enabling Nexus auto-fetch.
