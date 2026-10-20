/**
 * Release gate for the Altovena brand inside the shared RealtyFlow platform.
 * This does not control public intake, migrations, cron, SMTP or staging Auth.
 * It prevents an accidentally provisioned production brand from making its
 * workspace/API capabilities visible without an explicit separate approval.
 */
export function allowAltovenaProductionWorkspace(
  env: Partial<Pick<NodeJS.ProcessEnv,
    "VERCEL_ENV" | "ALTOVENA_PRODUCTION_WORKSPACE_ENABLED">> = process.env,
): boolean {
  return env.VERCEL_ENV !== "production" ||
    env.ALTOVENA_PRODUCTION_WORKSPACE_ENABLED === "true";
}
