import { assessAltovenaDatabaseIsolation } from "./preview-database-isolation";

export type AltovenaStagingCheck = {
  id: string;
  label: string;
  state: "verified" | "blocked" | "not_configured" | "needs_external_verification";
};
export type AltovenaStagingChecklist = {
  checks: AltovenaStagingCheck[];
  nextAction: string;
  // A configured Supabase endpoint is NOT a verified identity or a running test.
  stagingReadyForHumanTest: false;
};

/** Never return env values, keys, project IDs, staff emails or customer data. */
export function getAltovenaStagingChecklist(
  env: NodeJS.ProcessEnv = process.env,
): AltovenaStagingChecklist {
  const isolation = assessAltovenaDatabaseIsolation(env);
  const stagingEnabled = env.ALTOVENA_STAGING_ISOLATION_ENABLED === "true";
  const projectConfigured = Boolean(env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF?.trim());
  const endpointConfigured = Boolean(env.ALTOVENA_STAGING_SUPABASE_URL?.trim());
  const keyConfigured = Boolean(env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim());
  const blockedProject = isolation.reason === "PRODUCTION_PROJECT_FORBIDDEN" ||
    isolation.reason === "INVALID_STAGING_PROJECT";
  const endpointMismatch = isolation.reason === "STAGING_DATABASE_MISMATCH" &&
    projectConfigured && endpointConfigured && keyConfigured;
  const bindingVerified = isolation.state === "isolated_preview";

  const checks: AltovenaStagingCheck[] = [
    { id:"staging_database",label:"Separat Supabase-testprosjekt (kostnad må godkjennes)",
      state:!projectConfigured?"not_configured":blockedProject?"blocked":
        bindingVerified?"verified":"needs_external_verification" },
    { id:"staging_opt_in",label:"Staging-tilgang eksplisitt aktivert",
      state:stagingEnabled?"verified":"not_configured" },
    { id:"staging_endpoint",label:"Egen Altovena staging-adresse (server)",
      state:!endpointConfigured?"not_configured":
        endpointMismatch?"blocked":bindingVerified?"verified":"needs_external_verification" },
    { id:"staging_secret",label:"Separat servernøkkel for staging (kun konfigurert-status)",
      state:keyConfigured?"verified":"not_configured" },
    { id:"staging_auth",label:"To ekte testinnlogginger og aktive staging-grants",
      state:"needs_external_verification" },
    { id:"staging_e2e",label:"Syntetisk henvendelse, CRM-oppgave og tilbakekallingstest",
      state:"needs_external_verification" },
    { id:"smtp",label:"Eventuell SMTP-test med godkjente testmottakere",
      state:"needs_external_verification" },
  ];
  const nextAction =
    !projectConfigured
      ? "Innhent kostnadsgodkjenning for en separat Supabase-testdatabase. Ingen database opprettes fra denne siden."
    : blockedProject
      ? "Bruk en gyldig, separat staging-prosjekt-ID. Produksjonsprosjektet er ikke tillatt."
    : !stagingEnabled
      ? "Konfigurer Altovenas separate staging-tilkobling og aktiver staging-bryteren etter godkjenning."
    : !endpointConfigured
      ? "Konfigurer Altovenas serverbaserte staging-adresse på den aktuelle Vercel-preview-grenen."
    : !keyConfigured
      ? "Konfigurer servernøkkelen fra staging-prosjektet, kun som hemmelig Vercel preview-variabel."
    : !bindingVerified
      ? "Kontroller at staging-adressen nøyaktig samsvarer med den separate prosjekt-ID-en."
      : "Verifiser staging-database, Auth og to testbrukere med syntetiske data. URL-kontrollen alene godkjenner ikke oppstart.";
  return { checks, nextAction, stagingReadyForHumanTest:false };
}
