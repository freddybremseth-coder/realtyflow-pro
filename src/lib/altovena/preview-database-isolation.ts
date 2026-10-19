/**
 * No Altovena preview or local-development data access is permitted until
 * its Supabase endpoint is explicitly bound to a distinct staging project.
 * This check performs NO network calls and reveals NO database credentials.
 *
 * IMPORTANT: This verifies the URL routing boundary, not whether an unknown
 * secret is valid for the project. Separate staged Auth/grant E2E is required.
 */
const REALTYFLOW_PRODUCTION_SUPABASE_REF = "ereapsfcsqtdmzosgnnn";
const refPattern = /^[a-z0-9]{20}$/;

export type AltovenaDatabaseIsolation = {
  allowed: boolean;
  state: "production" | "test" | "isolated_preview" | "blocked";
  reason: "NOT_A_PREVIEW" | "TEST_PROCESS" | "STAGING_BINDING_VERIFIED" |
    "STAGING_DISABLED" | "INVALID_STAGING_PROJECT" |
    "PRODUCTION_PROJECT_FORBIDDEN" | "STAGING_DATABASE_MISMATCH";
};

export function assessAltovenaDatabaseIsolation(
  env: Partial<Pick<NodeJS.ProcessEnv,
    "VERCEL_ENV" | "NODE_ENV" | "ALTOVENA_STAGING_ISOLATION_ENABLED" |
    "ALTOVENA_STAGING_SUPABASE_PROJECT_REF" |
    "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">> = process.env,
): AltovenaDatabaseIsolation {
  if (env.VERCEL_ENV === "production")
    return {allowed: true,state:"production",reason:"NOT_A_PREVIEW"};

  if (env.VERCEL_ENV !== "preview" && env.NODE_ENV === "test")
    return {allowed:true,state:"test",reason:"TEST_PROCESS"};

  // Fail closed for preview, local development or unexpected deployment envs.
  const blocked = (reason: AltovenaDatabaseIsolation["reason"]): AltovenaDatabaseIsolation =>
    ({allowed:false,state:"blocked",reason});
  if (env.ALTOVENA_STAGING_ISOLATION_ENABLED !== "true")
    return blocked("STAGING_DISABLED");
  const ref = (env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF||"").trim();
  if (!refPattern.test(ref))return blocked("INVALID_STAGING_PROJECT");
  if (ref === REALTYFLOW_PRODUCTION_SUPABASE_REF)
    return blocked("PRODUCTION_PROJECT_FORBIDDEN");
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL||"");
    if (url.protocol!=="https:" || url.username || url.password ||
        url.port || url.pathname!=="/" || url.search || url.hash ||
        url.hostname!==`${ref}.supabase.co` ||
        !env.SUPABASE_SERVICE_ROLE_KEY)
      return blocked("STAGING_DATABASE_MISMATCH");
  } catch {
    return blocked("STAGING_DATABASE_MISMATCH");
  }
  return {allowed:true,state:"isolated_preview",reason:"STAGING_BINDING_VERIFIED"};
}
