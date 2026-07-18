export type PlatformTenant = {
  id: string;
  slug: string;
  name: string;
  status: string;
  customerType: "internal" | "customer" | "partner" | "reseller";
  plan: string;
  contactEmail: string | null;
  defaultLocale: string;
  defaultCurrency: string;
  timezone: string;
  dataRegion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlatformMembership = {
  id: string;
  tenantId: string;
  userId: string | null;
  userEmail: string | null;
  role: string;
  isOwner: boolean;
  status: "invited" | "active" | "suspended" | "revoked";
  invitedAt: string | null;
  acceptedAt: string | null;
};

export type PlatformApp = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  productType: "suite" | "standalone" | "vertical" | "integration";
  status: "draft" | "active" | "paused" | "retired";
  domain: string | null;
  icon: string | null;
  isSellable: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

export type PlatformModule = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  moduleType: string;
  status: string;
  version: string;
  icon: string | null;
  routePrefix: string | null;
  isCore: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

export type PlatformAppModule = {
  appId: string;
  moduleId: string;
  enabledByDefault: boolean;
  configurable: boolean;
  settings: Record<string, unknown>;
};

export type PlatformPlan = {
  id: string;
  appId: string;
  slug: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  currency: string;
  monthlyPriceMinor: number | null;
  yearlyPriceMinor: number | null;
  trialDays: number;
  isPublic: boolean;
  metadata: Record<string, unknown>;
};

export type PlatformPlanModule = {
  planId: string;
  moduleId: string;
  enabled: boolean;
  limits: Record<string, unknown>;
};

export type PlatformSubscription = {
  id: string;
  tenantId: string;
  appId: string;
  planId: string | null;
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "expired";
  provider: "manual" | "stripe" | "partner" | "legacy";
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  trialEndsAt: string | null;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlatformTenantModule = {
  tenantId: string;
  moduleId: string;
  planId: string | null;
  status: "trialing" | "active" | "disabled" | "suspended" | "expired";
  source: "legacy" | "manual" | "plan" | "partner";
  settings: Record<string, unknown>;
  startsAt: string;
  endsAt: string | null;
};

export type PlatformEntitlement = {
  id: string;
  tenantId: string;
  moduleId: string | null;
  entitlementKey: string;
  value: unknown;
  status: "active" | "revoked" | "expired";
  source: "module" | "plan" | "manual" | "partner";
  startsAt: string;
  endsAt: string | null;
};

export type PlatformBranding = {
  tenantId: string;
  appName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  emailFromName: string | null;
  locale: string | null;
  customCss: string | null;
  settings: Record<string, unknown>;
};

export type PlatformDomain = {
  id: string;
  tenantId: string;
  appId: string | null;
  hostname: string;
  domainType: "subdomain" | "custom";
  status: "pending" | "verified" | "active" | "failed" | "disabled";
  isPrimary: boolean;
  verificationToken: string;
  verificationDetails: Record<string, unknown>;
  verifiedAt: string | null;
};

export type PlatformUsageSummary = {
  tenantId: string;
  meterKey: string;
  quantity: string | number;
};

export type PlatformSnapshot = {
  generatedAt: string;
  summary: {
    tenantCount: number;
    customerCount: number;
    sellableAppCount: number;
    moduleCount: number;
    activeSubscriptionCount: number;
  };
  tenants: PlatformTenant[];
  memberships: PlatformMembership[];
  apps: PlatformApp[];
  modules: PlatformModule[];
  appModules: PlatformAppModule[];
  plans: PlatformPlan[];
  planModules: PlatformPlanModule[];
  subscriptions: PlatformSubscription[];
  tenantModules: PlatformTenantModule[];
  entitlements: PlatformEntitlement[];
  branding: PlatformBranding[];
  domains: PlatformDomain[];
  usage30d: PlatformUsageSummary[];
};
