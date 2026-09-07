import fs from 'node:fs';

const source = fs.readFileSync('src/services/integrations/youtube-health.ts', 'utf8');
for (const required of [
  'accessToken?: string',
  'accessExpiresAt?: Date | null',
  'if (accessTokenStillValid)',
  'access_token: candidate.accessToken',
  'else if (candidate.refreshToken)',
]) {
  if (!source.includes(required)) throw new Error(`Missing fresh-access health contract: ${required}`);
}
if (source.includes('auth.setCredentials({ refresh_token: candidate.refreshToken });\n      await auth.getAccessToken();\n\n      const client')) {
  throw new Error('Health check still unconditionally refreshes before YouTube verification.');
}
console.log('Re-Master YouTube health fresh-access contract passed.');
