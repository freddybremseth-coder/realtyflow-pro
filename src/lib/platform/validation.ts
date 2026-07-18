import { z } from "zod";

const uuid = z.string().uuid();
const nullableUrl = z.string().trim().url().max(2000).nullable().optional().or(z.literal(""));
const email = z.string().trim().toLowerCase().email().max(320);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/);
const metadata = z.record(z.string(), z.unknown()).optional();

const tenantPayload = z.object({
  id: uuid.optional(),
  slug,
  name: z.string().trim().min(2).max(200),
  status: z.string().trim().min(2).max(40).default("active"),
  plan: z.string().trim().min(2).max(80).optional(),
  customerType: z.enum(["internal", "customer", "partner", "reseller"]).default("customer"),
  contactEmail: email.nullable().optional().or(z.literal("")),
  defaultLocale: z.string().trim().min(2).max(20).default("nb-NO"),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"),
  timezone: z.string().trim().min(3).max(100).default("Europe/Madrid"),
  dataRegion: z.string().trim().min(2).max(40).default("eu"),
  metadata,
});

const membershipPayload = z.object({
  tenantId: uuid,
  userEmail: email,
  role: z.string().trim().min(2).max(80).default("member"),
  isOwner: z.boolean().default(false),
  status: z.enum(["invited", "active", "suspended", "revoked"]).default("invited"),
});

const modulePayload = z.object({
  tenantId: uuid,
  moduleSlug: slug,
  status: z.enum(["trialing", "active", "disabled", "suspended", "expired"]),
  source: z.enum(["legacy", "manual", "plan", "partner"]).default("manual"),
  settings: metadata,
  endsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
});

const entitlementPayload = z.object({
  tenantId: uuid,
  moduleSlug: slug.nullable().optional().or(z.literal("")),
  entitlementKey: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,126}$/),
  value: z.unknown(),
  status: z.enum(["active", "revoked", "expired"]).default("active"),
  source: z.enum(["module", "plan", "manual", "partner"]).default("manual"),
  endsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
});

const brandingPayload = z.object({
  tenantId: uuid,
  appName: z.string().trim().max(200).nullable().optional().or(z.literal("")),
  logoUrl: nullableUrl,
  faviconUrl: nullableUrl,
  primaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).default("#06b6d4"),
  accentColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).default("#8b5cf6"),
  supportEmail: email.nullable().optional().or(z.literal("")),
  emailFromName: z.string().trim().max(200).nullable().optional().or(z.literal("")),
  locale: z.string().trim().max(20).nullable().optional().or(z.literal("")),
  customCss: z.string().max(50_000).nullable().optional().or(z.literal("")),
  settings: metadata,
});

const domainPayload = z.object({
  tenantId: uuid,
  appSlug: slug.nullable().optional().or(z.literal("")),
  hostname: z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/),
  domainType: z.enum(["subdomain", "custom"]).default("custom"),
  status: z.enum(["pending", "verified", "active", "failed", "disabled"]).default("pending"),
  isPrimary: z.boolean().default(false),
  verificationDetails: metadata,
});

const subscriptionPayload = z.object({
  tenantId: uuid,
  appSlug: slug,
  planSlug: slug.nullable().optional().or(z.literal("")),
  status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled", "expired"]),
  provider: z.enum(["manual", "stripe", "partner", "legacy"]).default("manual"),
  externalCustomerId: z.string().trim().max(240).nullable().optional().or(z.literal("")),
  externalSubscriptionId: z.string().trim().max(240).nullable().optional().or(z.literal("")),
  trialEndsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
  currentPeriodStartsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
  currentPeriodEndsAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
  cancelAtPeriodEnd: z.boolean().default(false),
  metadata,
});

export const platformCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("upsert_tenant"), payload: tenantPayload }),
  z.object({ command: z.literal("upsert_membership"), payload: membershipPayload }),
  z.object({ command: z.literal("set_module"), payload: modulePayload }),
  z.object({ command: z.literal("set_entitlement"), payload: entitlementPayload }),
  z.object({ command: z.literal("upsert_branding"), payload: brandingPayload }),
  z.object({ command: z.literal("upsert_domain"), payload: domainPayload }),
  z.object({ command: z.literal("upsert_subscription"), payload: subscriptionPayload }),
]);

export type PlatformCommandInput = z.infer<typeof platformCommandSchema>;

export function platformValidationMessage(error: z.ZodError) {
  const first = error.issues[0];
  if (!first) return "Ugyldig plattformforespørsel.";
  return `${first.path.join(".") || "payload"}: ${first.message}`;
}
