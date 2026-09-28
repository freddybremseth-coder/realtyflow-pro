import { isPilotChannel } from "@/lib/marketing/brand-registry";

export const NEXT_ACTION_REQUEST_PREFIX = "growth-autopilot:";

export function isSystemNextActionRequest(requestedBy: string | null | undefined): boolean {
  return typeof requestedBy === "string" && requestedBy.startsWith(NEXT_ACTION_REQUEST_PREFIX);
}

export function nextActionRequestIdentity(actionId: string): string {
  return `${NEXT_ACTION_REQUEST_PREFIX}${actionId}`;
}

export function resolveAutopilotRunChannels(input: {
  brandId: string;
  configuredChannels: string[];
  requestedChannels: string[];
  systemNextAction: boolean;
  supportedChannels?: Set<string>;
}): Array<"instagram" | "facebook"> {
  const supported = input.supportedChannels ?? new Set(["instagram", "facebook"]);
  const configured = new Set(
    input.configuredChannels
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => supported.has(value)),
  );
  const hasExplicitRequest = input.requestedChannels.length > 0;
  const requested = Array.from(new Set(
    input.requestedChannels
      .map((value) => String(value).trim().toLowerCase())
      .filter((value) => supported.has(value)),
  ));

  if (!hasExplicitRequest) {
    return Array.from(configured).filter((value): value is "instagram" | "facebook" => value === "instagram" || value === "facebook");
  }
  if (!requested.length) return [];

  return requested.filter((channel): channel is "instagram" | "facebook" => {
    if (channel !== "instagram" && channel !== "facebook") return false;
    if (configured.has(channel)) return true;
    return input.systemNextAction && isPilotChannel(input.brandId, channel);
  });
}

export function nextActionPublicationMode(input: {
  configuredChannels: string[];
  targetChannel: string;
}): "LIVE_ELIGIBLE" | "REVIEW_ONLY" {
  const target = String(input.targetChannel).trim().toLowerCase();
  const configured = new Set(input.configuredChannels.map((value) => String(value).trim().toLowerCase()));
  return configured.has(target) ? "LIVE_ELIGIBLE" : "REVIEW_ONLY";
}
