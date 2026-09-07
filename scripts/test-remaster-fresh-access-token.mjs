import fs from 'node:fs';

const source = fs.readFileSync('src/services/integrations/remaster-youtube-longform.ts', 'utf8');

const freshBlock = source.match(/if \(accessTokenStillValid\) \{[\s\S]*?\} else \{[\s\S]*?await auth\.getAccessToken\(\);[\s\S]*?\}/)?.[0] || '';

if (!freshBlock.includes('auth.setCredentials({ access_token: accessToken })')) {
  throw new Error('Fresh access-token branch is missing.');
}
if (freshBlock.includes('refresh_token: refreshToken') && freshBlock.indexOf('refresh_token: refreshToken') < freshBlock.indexOf('} else {')) {
  throw new Error('Fresh access-token branch must not include refresh_token.');
}
if (!freshBlock.includes('auth.setCredentials({ refresh_token: refreshToken })')) {
  throw new Error('Expired access-token branch must retain refresh support.');
}

console.log('Re-Master fresh access-token isolation contract: OK');
