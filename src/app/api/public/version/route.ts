import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/version
 * Public, unauthenticated deployment marker — used to verify which commit is
 * actually live in production when debugging (no secrets exposed).
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID || null,
    uploadLadder: 'v3',
  });
}
