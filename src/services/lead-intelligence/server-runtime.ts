import "server-only";

import { NextRequest, NextResponse } from "next/server";
import type { ClientBase } from "pg";
import {
  CORRELATION_ID_HEADER,
  createErrorEnvelope,
  getOrCreateCorrelationId,
  sanitizeErrorMessage,
} from "@/lib/observability";
import { verifyAdminSession } from "@/lib/admin-auth";
import { LeadIntelligenceError } from "./extraction";
import {
  LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV,
  LeadIntelligencePersistenceError,
  LeadIntelligencePersistenceRepository,
  findLeadContactCandidatePreviews,
  getLeadContactLookupHmacSecret,
  type ContactLookupRow,
  type QueryClient,
} from "./persistence";
import { isLeadIntelligenceEnabled, isLeadIntelligencePersistenceEnabled } from "./feature-flags";
import { LeadIntelligenceReviewError } from "./review";
import { assertLeadIntelligenceRateLimit } from "./api-guards";
import { LeadIntelligenceRealEstateBrandSchema } from "./brand-allowlist";

export const LEAD_INTELLIGENCE_DATABASE_URL_ENV = "REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL";

export function leadIntelligenceHeaders(correlationId: string) {
  return {
    [CORRELATION_ID_HEADER]: correlationId,
    "cache-control": "no-store",
  };
}

export async function getLeadIntelligenceRouteContext(request: NextRequest) {
  const correlationId = getOrCreateCorrelationId(request.headers);
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email) {
    throw new LeadIntelligenceError("AUTH_REQUIRED", "Authentication required", 401);
  }

  if (!isLeadIntelligenceEnabled()) {
    throw new LeadIntelligenceError(
      "LEAD_INTELLIGENCE_DISABLED",
      "Lead Intelligence is disabled",
      403,
    );
  }

  if (!isLeadIntelligencePersistenceEnabled()) {
    throw new LeadIntelligencePersistenceError(
      "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED",
      "Lead Intelligence persistence is disabled",
      403,
    );
  }

  return {
    correlationId,
    email: session.email.toLowerCase(),
    auth: {
      email: session.email.toLowerCase(),
      isAdmin: true,
    },
  };
}

export function leadIntelligenceJsonError(error: unknown, correlationId: string) {
  const typed =
    error instanceof LeadIntelligenceError ||
    error instanceof LeadIntelligencePersistenceError ||
    error instanceof LeadIntelligenceReviewError
      ? error
      : new LeadIntelligenceError("INTERNAL_ERROR", "Internal server error", 500);

  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : "INTERNAL_ERROR";

  const status =
    error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number"
      ? Number((error as { status: number }).status)
      : 500;

  const retryable = status >= 500 || status === 429 ? "retryable" : "not_retryable";
  const message = status >= 500 ? "Internal server error" : sanitizeErrorMessage(typed.message);
  return NextResponse.json(
    createErrorEnvelope({
      correlationId,
      code,
      message,
      status,
      details:
        error instanceof LeadIntelligenceReviewError
          ? error.details
          : undefined,
      retryable,
    }),
    {
      status,
      headers: leadIntelligenceHeaders(correlationId),
    },
  );
}

export async function readJsonBody(request: NextRequest, maxBytes = 48 * 1024) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new LeadIntelligenceError("INPUT_TOO_LONG", "Request body is too large", 413);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new LeadIntelligenceError("INPUT_TOO_LONG", "Request body is too large", 413);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Invalid JSON body", 400);
  }
}

function getLeadIntelligenceDatabaseUrl() {
  const dedicated = process.env[LEAD_INTELLIGENCE_DATABASE_URL_ENV];
  const isProduction = process.env.VERCEL_ENV === "production";
  if (isProduction && !dedicated) {
    throw new LeadIntelligenceReviewError(
      "PERSISTENCE_SCHEMA_NOT_READY",
      "Lead Intelligence persistence database is not configured",
      503,
    );
  }

  const url = dedicated ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new LeadIntelligenceReviewError(
      "PERSISTENCE_SCHEMA_NOT_READY",
      "Lead Intelligence persistence database is not configured",
      503,
    );
  }
  return url;
}

function queryClient(client: ClientBase): QueryClient {
  return {
    query: (sql, values) => client.query(sql, values as unknown[] | undefined) as Promise<any>,
  };
}

export function assertLeadIntelligenceRuntimeBrand(brand: unknown) {
  const parsed = LeadIntelligenceRealEstateBrandSchema.safeParse(brand);
  if (!parsed.success) {
    throw new LeadIntelligenceError("INVALID_REQUEST", "Lead Intelligence brand is not allowed", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

async function setLeadIntelligenceBrandContext(client: ClientBase, brand: string) {
  await client.query("select set_config('app.lead_intelligence_brand', $1, true)", [brand]);
}

export async function withLeadIntelligenceTransaction<T>(
  brand: string,
  fn: (client: QueryClient) => Promise<T>,
) {
  const runtimeBrand = assertLeadIntelligenceRuntimeBrand(brand);
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: getLeadIntelligenceDatabaseUrl(),
    statement_timeout: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await setLeadIntelligenceBrandContext(client, runtimeBrand);
    const result = await fn(queryClient(client));
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Keep rollback errors out of the response; the original error is safer and more useful.
    }
    if (
      error instanceof LeadIntelligenceError ||
      error instanceof LeadIntelligencePersistenceError ||
      error instanceof LeadIntelligenceReviewError
    ) {
      throw error;
    }
    throw mapDatabaseError(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function withLeadIntelligenceQuery<T>(
  brand: string,
  fn: (client: QueryClient) => Promise<T>,
) {
  const runtimeBrand = assertLeadIntelligenceRuntimeBrand(brand);
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: getLeadIntelligenceDatabaseUrl(),
    statement_timeout: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    await client.query("begin");
    await client.query("set transaction read only");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local statement_timeout = '30s'");
    await setLeadIntelligenceBrandContext(client, runtimeBrand);
    const result = await fn(queryClient(client));
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Keep rollback errors out of the response; the original error is safer and more useful.
    }
    if (
      error instanceof LeadIntelligenceError ||
      error instanceof LeadIntelligencePersistenceError ||
      error instanceof LeadIntelligenceReviewError
    ) {
      throw error;
    }
    throw mapDatabaseError(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function mapDatabaseError(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (["42P01", "42883", "3F000"].includes(code)) {
    return new LeadIntelligenceReviewError(
      "PERSISTENCE_SCHEMA_NOT_READY",
      "Lead Intelligence persistence schema is not ready",
      503,
    );
  }
  if (["23503", "23505", "23514"].includes(code)) {
    return new LeadIntelligenceReviewError(
      "REVIEW_CONFLICT",
      "Lead Intelligence review could not be saved because the persisted state changed",
      409,
    );
  }
  return new LeadIntelligenceReviewError(
    "DATABASE_ERROR",
    "Lead Intelligence persistence operation failed",
    500,
    {
      databaseCode: code || "unknown",
    },
  );
}

export async function findContactCandidatePreviews(input: {
  brand: string;
  contact: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    country?: string | null;
  };
}) {
  const brand = assertLeadIntelligenceRuntimeBrand(input.brand);
  const hmacSecret = getLeadContactLookupHmacSecret({
    [LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV]: process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV],
  });

  return withLeadIntelligenceQuery(brand, (db) =>
    findContactCandidatePreviewsWithDb(db, { ...input, brand }, hmacSecret),
  );
}

export async function findContactCandidatePreviewsWithDb(
  db: QueryClient,
  input: {
    brand: string;
    contact: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      country?: string | null;
    };
  },
  hmacSecret = getLeadContactLookupHmacSecret({
    [LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV]: process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV],
  }),
) {
  const brand = assertLeadIntelligenceRuntimeBrand(input.brand);
  const { rows } = await db.query<ContactLookupRow>(
    `
      select
        id::text as "contactId",
        brand,
        name,
        phone,
        email
      from public.lead_intelligence_contact_lookup
      where (
          lower(email) = lower($1)
          or regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g') =
             regexp_replace(coalesce($2, ''), '[^0-9+]', '', 'g')
          or lower(name) = lower($3)
        )
      order by updated_at desc nulls last, created_at desc nulls last
      limit 25
    `,
    [
      input.contact.email || "",
      input.contact.phone || "",
      input.contact.name || "",
    ],
  );

  return findLeadContactCandidatePreviews(
    {
      brand,
      name: input.contact.name,
      phone: input.contact.phone,
      email: input.contact.email,
      country: input.contact.country,
    },
    rows,
    { hmacSecret },
  );
}

export async function verifySelectedContactCandidateWithDb(
  db: QueryClient,
  input: {
    brand: string;
    contactId: string;
    contact: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      country?: string | null;
    };
  },
) {
  const brand = assertLeadIntelligenceRuntimeBrand(input.brand);
  const { rows } = await db.query<ContactLookupRow>(
    `
      select
        id::text as "contactId",
        brand,
        name,
        phone,
        email
      from public.lead_intelligence_contact_lookup
      where id = $1::uuid
      limit 1
    `,
    [input.contactId],
  );
  const row = rows[0];
  if (!row) {
    throw new LeadIntelligenceReviewError(
      "CONTACT_CANDIDATE_STALE",
      "Selected contact no longer exists",
      409,
    );
  }
  if (row.brand !== brand) {
    throw new LeadIntelligenceReviewError(
      "CONTACT_BRAND_MISMATCH",
      "Selected contact belongs to another brand",
      409,
    );
  }

  const candidates = findLeadContactCandidatePreviews(
    {
      brand,
      name: input.contact.name,
      phone: input.contact.phone,
      email: input.contact.email,
      country: input.contact.country,
    },
    [row],
    {
      hmacSecret: getLeadContactLookupHmacSecret({
        [LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV]: process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV],
      }),
    },
  );
  if (!candidates.some((candidate) => candidate.contactId === input.contactId)) {
    throw new LeadIntelligenceReviewError(
      "CONTACT_CANDIDATE_STALE",
      "Selected contact no longer matches the reviewed contact details",
      409,
    );
  }
  return candidates[0];
}

export function createLeadIntelligenceRepository(client: QueryClient, context: {
  email: string;
}) {
  return new LeadIntelligencePersistenceRepository(client, {
    auth: {
      email: context.email,
      isAdmin: true,
    },
    env: process.env,
  });
}

export function assertLeadIntelligenceActionRateLimit(identity: string, action: string) {
  assertLeadIntelligenceRateLimit(`${identity}:${action}`);
}
