import fs from 'node:fs';

const source = fs.readFileSync('src/services/integrations/youtube-health.ts', 'utf8');
for (const required of [
  'tokens.expiresAt',
  'if (accessTokenStillValid)',
  'access_token: clean(tokens.accessToken)',
  'else if (clean(tokens.refreshToken))',
  'refresh_token: clean(tokens.refreshToken)',
  'await auth.getAccessToken()',
  'item.id) === String(channel.external_id)',
  'reason: "channel_mismatch"',
  'if (channels.length > 1)',
  'reason: "ambiguous_channel"',
]) {
  if (!source.includes(required)) throw new Error(`Missing fresh-access health contract: ${required}`);
}
if (source.includes('.from("brand_settings")')) {
  throw new Error('YouTube health must not fall back to legacy brand_settings tokens.');
}
console.log('Re-Master YouTube canonical fresh-access contract passed.');
