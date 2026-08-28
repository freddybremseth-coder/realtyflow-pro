import { youtube, type youtube_v3 } from "@googleapis/youtube";
import type { OAuth2Client } from "google-auth-library";

/**
 * Keep the generated YouTube client behind one dependency boundary.
 *
 * @googleapis/youtube and the application can resolve compatible patch
 * versions of google-auth-library as separate physical packages. Their
 * OAuth2Client classes then become nominally incompatible in TypeScript due
 * to private fields, even though the runtime contract is the same. Centralize
 * the narrow cast here so integrations do not spread unsafe assertions.
 */
export function createYoutubeOAuthClient(auth: OAuth2Client): youtube_v3.Youtube {
  return youtube({
    version: "v3",
    auth: auth as unknown as youtube_v3.Options["auth"],
  });
}

