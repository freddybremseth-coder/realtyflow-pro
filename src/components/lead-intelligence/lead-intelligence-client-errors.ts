import type { SafeErrorResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

export type LeadIntelligenceClientError = SafeErrorResponse["error"];

export function apiResponseError(
  response: Response,
  body: SafeErrorResponse | { ok: boolean },
  message: string,
): LeadIntelligenceClientError {
  if ("error" in body && body.error) {
    return body.error;
  }

  return {
    correlationId: response.headers.get("x-correlation-id") || "unknown",
    code: "INTERNAL_ERROR",
    message,
  };
}

export function clientApiError(message: string): LeadIntelligenceClientError {
  return {
    correlationId: "client",
    code: "INTERNAL_ERROR",
    message,
  };
}
