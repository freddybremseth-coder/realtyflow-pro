import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  requireSpanishUser,
  spanishJson,
  spanishPreflight,
} from "@/lib/spanish-api";

const MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function normalizedContents(input: unknown) {
  if (typeof input === "string") {
    return [{ role: "user", parts: [{ text: input }] }];
  }
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") return [input];
  return [];
}

function accessIsActive(snapshot: any) {
  const sub = snapshot?.subscription || {};
  const accessKind = String(sub.access_kind || "");
  const provider = String(sub.provider || "");
  const status = String(sub.status || "");
  const accessStatus = String(sub.access_status || "");

  if (accessKind === "lifetime") return true;
  if (!["active", "grace"].includes(accessStatus)) return false;

  if (provider === "stripe") {
    if (status === "active" || status === "trialing") return true;
    return status === "past_due" && accessStatus === "grace";
  }

  if (!["active", "trialing"].includes(status)) return false;
  const end = status === "trialing" ? sub.trial_ends_at : sub.current_period_ends_at;
  return !end || new Date(end).getTime() > Date.now();
}

function pricesForNow() {
  const newRates = Date.now() >= Date.UTC(2027, 0, 1);
  return {
    inputPerMillionUsd: newRates ? 1.5 : 0.75,
    outputPerMillionUsd: newRates ? 7.5 : 3.75,
  };
}

export async function POST(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context.error;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return spanishJson(request, { error: "Spanish AI is not configured" }, 503);

  const [{ data: snapshot, error: snapshotError }, { data: usage, error: usageError }] =
    await Promise.all([
      context.supabase.rpc("spanish_account_snapshot", { p_user_id: context.user.id }),
      context.supabase.rpc("spanish_usage_summary", { p_user_id: context.user.id }),
    ]);

  if (snapshotError || usageError) {
    console.error("[Spanish AI] Access lookup failed:", snapshotError || usageError);
    return spanishJson(request, { error: "Could not verify access" }, 500);
  }

  if (!accessIsActive(snapshot)) {
    return spanishJson(request, { error: "Active Spanish access is required", code: "ACCESS_REQUIRED" }, 402);
  }

  const accessKind = String((snapshot as any)?.subscription?.access_kind || "");
  const status = String((snapshot as any)?.subscription?.status || "");
  if (status === "trialing" || accessKind === "trial") {
    const used = Number((usage as any)?.ai_requests || 0);
    if (used >= 4) {
      return spanishJson(request, {
        error: "The free trial includes 4 AI tasks",
        code: "TRIAL_AI_LIMIT",
        used,
        limit: 4,
      }, 402);
    }
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const contents = normalizedContents(body.contents);
  if (contents.length === 0) {
    return spanishJson(request, { error: "contents is required" }, 400);
  }

  const clientConfig = body.config && typeof body.config === "object" ? body.config : {};
  const generationConfig: Record<string, unknown> = {};

  if (typeof clientConfig.maxOutputTokens === "number") {
    generationConfig.maxOutputTokens = Math.min(Math.max(clientConfig.maxOutputTokens, 1), 8192);
  }
  if (typeof clientConfig.temperature === "number") {
    generationConfig.temperature = Math.min(Math.max(clientConfig.temperature, 0), 2);
  }
  if (typeof clientConfig.responseMimeType === "string") {
    generationConfig.responseMimeType = clientConfig.responseMimeType;
  }
  if (clientConfig.responseSchema && typeof clientConfig.responseSchema === "object") {
    generationConfig.responseSchema = clientConfig.responseSchema;
  }

  const payload: Record<string, unknown> = { contents };
  if (Object.keys(generationConfig).length > 0) payload.generationConfig = generationConfig;

  if (typeof clientConfig.systemInstruction === "string" && clientConfig.systemInstruction.trim()) {
    payload.systemInstruction = {
      parts: [{ text: clientConfig.systemInstruction.trim() }],
    };
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });

  const data = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    console.error("[Spanish AI] Gemini error:", response.status, data?.error?.message);
    return spanishJson(request, { error: "AI request failed" }, 502);
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("");

  const usageMetadata = data.usageMetadata || {};
  const inputTokens = Number(usageMetadata.promptTokenCount || 0);
  const outputTokens = Number(usageMetadata.candidatesTokenCount || usageMetadata.totalTokenCount - inputTokens || 0);
  const prices = pricesForNow();
  const inputCostUsd = inputTokens * prices.inputPerMillionUsd / 1_000_000;
  const outputCostUsd = outputTokens * prices.outputPerMillionUsd / 1_000_000;
  const requestId = randomUUID();

  const usageWrites: PromiseLike<unknown>[] = [
    context.supabase.rpc("spanish_record_usage", {
      p_user_id: context.user.id,
      p_meter_key: "ai.request",
      p_quantity: 1,
      p_idempotency_key: `${requestId}:request`,
      p_dimensions: {
        provider: "gemini",
        model: MODEL,
        feature: String(body.feature || "spanish"),
        estimated_cost_usd: 0,
      },
    }),
  ];

  if (inputTokens > 0) {
    usageWrites.push(context.supabase.rpc("spanish_record_usage", {
      p_user_id: context.user.id,
      p_meter_key: "ai.text.input_tokens",
      p_quantity: inputTokens,
      p_idempotency_key: `${requestId}:input`,
      p_dimensions: {
        provider: "gemini",
        model: MODEL,
        rate_usd_per_million: prices.inputPerMillionUsd,
        estimated_cost_usd: inputCostUsd,
      },
    }));
  }

  if (outputTokens > 0) {
    usageWrites.push(context.supabase.rpc("spanish_record_usage", {
      p_user_id: context.user.id,
      p_meter_key: "ai.text.output_tokens",
      p_quantity: outputTokens,
      p_idempotency_key: `${requestId}:output`,
      p_dimensions: {
        provider: "gemini",
        model: MODEL,
        rate_usd_per_million: prices.outputPerMillionUsd,
        estimated_cost_usd: outputCostUsd,
      },
    }));
  }

  const usageResults = await Promise.allSettled(usageWrites);
  if (usageResults.some(result => result.status === "rejected")) {
    console.warn("[Spanish AI] Usage metering partially failed");
  }

  return spanishJson(request, {
    text,
    candidates: data.candidates || [],
    usageMetadata,
    billing: {
      model: MODEL,
      inputTokens,
      outputTokens,
      estimatedCostUsd: Number((inputCostUsd + outputCostUsd).toFixed(8)),
    },
  });
}

export async function OPTIONS(request: NextRequest) {
  return spanishPreflight(request);
}
