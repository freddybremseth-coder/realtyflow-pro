export type WhatsAppReadinessStatus = "READY" | "PARTIAL" | "BLOCKED";

export type WhatsAppReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
};

export type WhatsAppReadiness = {
  status: WhatsAppReadinessStatus;
  inboundReady: boolean;
  outboundReady: boolean;
  autoReplyEnabled: boolean;
  checks: WhatsAppReadinessCheck[];
  missingRequired: string[];
  missingOptional: string[];
};

function has(value: unknown) {
  return Boolean(String(value || "").trim());
}

function validJsonObject(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0);
  } catch {
    return false;
  }
}

export function assessWhatsAppReadiness(env: Record<string, string | undefined>): WhatsAppReadiness {
  const autoReplyEnabled = env.WHATSAPP_AUTOREPLY_ENABLED === "true";

  const checks: WhatsAppReadinessCheck[] = [
    {
      id: "verify_token",
      label: "Webhook verify token",
      ok: has(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      required: true,
      detail: "Required for Meta webhook challenge verification.",
    },
    {
      id: "app_secret",
      label: "Meta app secret",
      ok: has(env.WHATSAPP_META_APP_SECRET),
      required: true,
      detail: "Required to validate x-hub-signature-256 before processing inbound messages.",
    },
    {
      id: "phone_brand_map",
      label: "Phone number to brand mapping",
      ok: validJsonObject(env.WHATSAPP_PHONE_BRAND_MAP),
      required: true,
      detail: "Required to route each WhatsApp Business phone number to the correct RealtyFlow brand.",
    },
    {
      id: "access_token",
      label: "WhatsApp access token",
      ok: has(env.WHATSAPP_ACCESS_TOKEN),
      required: autoReplyEnabled,
      detail: autoReplyEnabled ? "Required because automatic outbound replies are enabled." : "Optional while automatic outbound replies are disabled.",
    },
    {
      id: "graph_version",
      label: "Meta Graph API version",
      ok: has(env.WHATSAPP_GRAPH_VERSION),
      required: autoReplyEnabled,
      detail: autoReplyEnabled ? "Required because automatic outbound replies are enabled." : "Optional while automatic outbound replies are disabled.",
    },
  ];

  const inboundReady = checks.filter((check) => ["verify_token", "app_secret", "phone_brand_map"].includes(check.id)).every((check) => check.ok);
  const outboundReady = autoReplyEnabled
    ? checks.filter((check) => ["access_token", "graph_version"].includes(check.id)).every((check) => check.ok)
    : false;
  const missingRequired = checks.filter((check) => check.required && !check.ok).map((check) => check.id);
  const missingOptional = checks.filter((check) => !check.required && !check.ok).map((check) => check.id);

  const status: WhatsAppReadinessStatus = missingRequired.length > 0
    ? "BLOCKED"
    : autoReplyEnabled && outboundReady
      ? "READY"
      : inboundReady
        ? "PARTIAL"
        : "BLOCKED";

  return {
    status,
    inboundReady,
    outboundReady,
    autoReplyEnabled,
    checks,
    missingRequired,
    missingOptional,
  };
}
