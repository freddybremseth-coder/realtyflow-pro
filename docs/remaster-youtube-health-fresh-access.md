# Re-Master YouTube fresh access health fix

Playlist recovery performs a brand-level YouTube health check before repairing playlists. That health check must use the encrypted OAuth access token while it is still valid and only fall back to refresh-token exchange after expiry. This matches the long-form client and prevents a revoked refresh token from blocking operations during the valid access-token window immediately after OAuth reconnect.
