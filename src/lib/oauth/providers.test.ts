import assert from "node:assert/strict";
import test from "node:test";

import { getGoogleCredentials } from "./providers";

const KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "SOLEADA_GOOGLE_CLIENT_ID",
  "SOLEADA_GOOGLE_CLIENT_SECRET",
] as const;

test("Google OAuth credentials support brand override with safe global fallback", () => {
  const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  try {
    for (const key of KEYS) delete process.env[key];

    process.env.GOOGLE_CLIENT_ID = "global-client";
    process.env.GOOGLE_CLIENT_SECRET = "global-secret";

    assert.deepEqual(getGoogleCredentials("zeneco"), {
      clientId: "global-client",
      clientSecret: "global-secret",
    });

    process.env.SOLEADA_GOOGLE_CLIENT_ID = "soleada-client";
    process.env.SOLEADA_GOOGLE_CLIENT_SECRET = "soleada-secret";

    assert.deepEqual(getGoogleCredentials("soleada"), {
      clientId: "soleada-client",
      clientSecret: "soleada-secret",
    });
    assert.deepEqual(getGoogleCredentials("zeneco"), {
      clientId: "global-client",
      clientSecret: "global-secret",
    });

    delete process.env.SOLEADA_GOOGLE_CLIENT_SECRET;
    assert.throws(
      () => getGoogleCredentials("soleada"),
      /Brand-scoped Google OAuth for soleada is incomplete/,
    );
  } finally {
    for (const key of KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
