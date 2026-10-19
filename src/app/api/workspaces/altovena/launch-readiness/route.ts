import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { hasVerifiedBrandGrant, type WorkspacePermission } from "@/lib/workspaces/brand-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

// The Altovena partner may operate all currently supported, scoped tools,
// not owner-only admin settings or Zen/Pinoso-only property/video pipelines.
const OPERATIVE_PERMISSIONS: WorkspacePermission[] = [
  "crm.read", "crm.write",
  "marketing.read", "marketing.draft", "marketing.publish",
  "content.read", "content.edit", "content.publish",
  "email.read", "email.draft", "email.send",
  "visibility.read", "visibility.plan",
  "ads.read", "ads.draft", "events.plan", "nexus.read",
];

/**
 * Read-only and owner-session-only release checklist.
 * No contact data, user IDs, account emails, API tokens or env values are exposed.
 * An authenticated operator account is verified by its explicitly configured
 * Supabase Auth ID, never by guessing a user's name or email.
 */
export async function GET(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return reply({ ok: false, error: "AUTH_REQUIRED" }, 401);
  if (context.role !== "OWNER" || context.source !== "owner-session")
    return reply({ ok: false, error: "OWNER_REQUIRED" }, 403);

  const supabase = getPlatformSupabase();
  if (!supabase) return reply({ ok: false, error: "WORKSPACE_UNAVAILABLE" }, 503);

  const { data: snapshot, error: snapshotError } = await supabase.rpc("workspace_access_snapshot");
  if (snapshotError || !snapshot || !Array.isArray(snapshot.brands))
    return reply({ ok: false, error: "WORKSPACE_UNAVAILABLE" }, 503);
  const brand = snapshot.brands.find((item: any) => item?.brand_key === "altovena") || null;
  const brandRegistered = typeof brand?.id === "string" && brand.id.length > 0;
  // Check the *actual* deployed schema; environment variables alone are not proof
  // that a write RPC exists or that anonymous users are denied execute access.
  const { data: health, error: healthError } = await supabase.rpc("altovena_intake_health");
  const migrationMissing = Boolean(healthError &&
    (healthError.code === "PGRST202" || healthError.code === "42883") &&
    /altovena_intake_health/i.test(healthError.message || ""));
  if (healthError && !migrationMissing)
    return reply({ ok: false, error: "INTAKE_HEALTH_UNAVAILABLE" }, 503);
  const migrationHealthy = !healthError &&
    health?.schema_version === "altovena-intake-v1" &&
    health?.brand_present === true &&
    health?.receipts_present === true &&
    health?.intake_rpc_secured === true &&
    health?.task_rpc_secured === true &&
    brandRegistered;

  // This is RealtyFlow-side intake readiness only. The independent Altovena
  // deployment, verified Turnstile, privacy review and a real test are separate gates.
  const intakeConfigured = migrationHealthy && process.env.ALTOVENA_INTAKE_ENABLED === "true" &&
    Boolean(process.env.ALTOVENA_INTAKE_KEY &&
      process.env.ALTOVENA_INTAKE_KEY.length >= 32 &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY);

  const id = (process.env.ALTOVENA_ANDREA_AUTH_USER_ID || "").trim();
  const operatorConfigured = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  let operatorVerified = false;
  let operatorPermissionsComplete = false;
  // Identity and permission checks must be independent. An active verified staff
  // account does not imply any Altovena access, and should be identifiable even
  // before the brand exists in the database.
  if (operatorConfigured) {
    const { data: auth, error: authError } = await supabase.auth.admin.getUserById(id);
    if (authError) return reply({ ok: false, error: "USER_DIRECTORY_UNAVAILABLE" }, 503);
    const user = auth?.user;
    if (user?.id === id && typeof user.email === "string" && user.email.trim()) {
      operatorVerified = true;
      if (brandRegistered) {
        const email = user.email.trim().toLowerCase();
        const { data: grants, error: grantsError } = await supabase.rpc("workspace_user_brand_grants", {
          p_email: email,
        });
        if (grantsError || !Array.isArray(grants))
          return reply({ ok: false, error: "GRANTS_UNAVAILABLE" }, 503);
        const grant = grants.find((entry: any) => entry?.brand?.id === brand.id)?.grant || null;
        operatorPermissionsComplete = OPERATIVE_PERMISSIONS.every(permission =>
          hasVerifiedBrandGrant({
            grant, brandId: brand.id, sessionEmail: email, verifiedUserId: user.id,
            verifiedUserEmail: email, permission,
          }),
        );
      }
    }
  }

  const checks = [
    { id: "brand", label: "Altovena-merkevare i RealtyFlow", state: brandRegistered ? "verified" : "blocked" },
    { id: "migration", label: "Databasemigrasjon og sikre mottaksfunksjoner", state: migrationHealthy ? "verified" : "blocked" },
    { id: "owner", label: "Eierøkten er autentisert", state: "verified" },
    { id: "operator_identity", label: "Andreas autentiserte brukerkonto", state: !operatorConfigured ? "not_configured" : operatorVerified ? "verified" : "blocked" },
    { id: "operator_grants", label: "Andreas merkevarespesifikke arbeidsrettigheter", state: !operatorConfigured ? "not_configured" : operatorPermissionsComplete ? "verified" : "blocked" },
    { id: "receiver", label: "Sikkert mottak: database og serverkonfigurasjon", state: intakeConfigured ? "verified" : "blocked" },
    { id: "website", label: "Altovena-skjema og botbeskyttelse", state: "needs_external_verification" },
    { id: "legal", label: "Juridisk ansvar, sletterutiner og personvern", state: "needs_external_verification" },
    { id: "e2e", label: "Syntetisk ende-til-ende-test og oppfølgingsvarsel", state: "needs_external_verification" },
    { id: "domain", label: "Altovena.com og HTTPS", state: "needs_external_verification" },
  ] as const;
  // A visible explanation and owner of each missing item. This is a FIXED
  // server-side checklist, not instructions generated from secrets/PII.
  // Review-required steps must never be silently marked done by CI.
  const actionGuide: Record<string, { owner: string; verification: "automatic" | "manual"; nextAction: string }> = {
    brand: {
      owner: "Teknisk ansvarlig", verification: "automatic",
      nextAction: "Kontroller at Altovena er registrert som egen merkevare i et godkjent testmiljø. Ikke opprett eller endre kundedata fra denne siden.",
    },
    migration: {
      owner: "Teknisk ansvarlig", verification: "automatic",
      nextAction: "Test den versjonerte CRM-migreringen i et isolert miljø, inkludert RLS og rollebegrensning på mottaksfunksjonene. Produksjonsmigrering krever separat godkjenning.",
    },
    owner: {
      owner: "Eier", verification: "automatic",
      nextAction: "Bruk en verifisert eierøkt ved gjennomgang. Andre kontroller er fortsatt nødvendige.",
    },
    operator_identity: {
      owner: "Eier / systemadministrator", verification: "automatic",
      nextAction: "Knytt Andreas bekreftede Supabase Auth-bruker-ID til en beskyttet konfigurasjon. Bekreft identiteten uten å vise e-post eller ID her.",
    },
    operator_grants: {
      owner: "Eier / systemadministrator", verification: "automatic",
      nextAction: "Bekreft aktive, Altovena-spesifikke arbeidsrettigheter for riktig bruker. Kontroller også at tilbakekalt tilgang blir avvist.",
    },
    receiver: {
      owner: "Teknisk ansvarlig", verification: "automatic",
      nextAction: "Kontroller databasefunksjon, servernøkkel og sperret offentlig API først i testmiljø. Ingen nøkkel eller aktiveringsknapp vises her.",
    },
    website: {
      owner: "Nettsideansvarlig", verification: "manual",
      nextAction: "Kontroller kontaktskjema, samtykketekst, Cloudflare Turnstile og respons ved feil i Altovena-forhåndsvisningen. Lokal CI alene er ikke tilstrekkelig.",
    },
    legal: {
      owner: "Eier / personvernansvarlig", verification: "manual",
      nextAction: "Godkjenn behandlingsansvarlig, formål, personvernerklæring, lagringstid, sletting og rutiner for henvendelser.",
    },
    e2e: {
      owner: "Eier / testansvarlig", verification: "manual",
      nextAction: "Send én syntetisk henvendelse via godkjent staging-nettverk. Verifiser samme kontakt og oppgave i to reelle, rettighetsstyrte økter og kontroller opprydding.",
    },
    domain: {
      owner: "Nettsideansvarlig", verification: "manual",
      nextAction: "Bekreft korrekt domene, HTTPS, serverruting og at nettstedet ikke sender data til feil miljø.",
    },
  };
  const detailedChecks = checks.map(check => ({
    ...check,
    ...actionGuide[check.id],
  }));
  // The oldest blocking prerequisite is displayed first, not an inferred
  // green light for publish. Manual gates always stay externally unverified.
  const nextSteps = detailedChecks
    .filter(check => check.state !== "verified")
    .map(check => ({id: check.id, label: check.label,
      owner: check.owner, nextAction: check.nextAction,
      verification: check.verification, state: check.state}));
  const readyForPublicForm = false; // Only a separately audited operator release may change this.
  return reply({
    ok: true,
    brand: "altovena",
    readyForPublicForm,
    summary: "Kun statuskontroll – aktiverer ikke kontaktskjema eller kundedata.",
    checks: detailedChecks,
    nextSteps,
    checkedAt: new Date().toISOString(),
  });
}
