/**
 * Read-only Nexus task board. No side effects, no fabricated rows.
 * Requires a trusted PostgreSQL connection to the private core schema.
 */
export interface NexusTaskBoardQueryClient {
  query(sql: string, values: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export type NexusTaskBoardEntry = {
  id: string;
  brandId: string;
  brandKey: string;
  status: string;
  version: number;
  actionType: string;
  evidenceCount: number;
  qualityReviewed: boolean;
  preflightPassed: boolean;
  reviewDecision: string | null;
  reviewExpiresAt: string | null;
  reserved: boolean;
  createdAt: string;
  updatedAt: string;
  events: Array<{ type: string; at: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["draft","researching","review_required","approved","rejected","executing","completed","failed","cancelled"]);
const EVENT_TYPES = new Set(["proposal_created","proposal_approved","proposal_rejected"]);
const REVIEW_DECISIONS = new Set(["approved","rejected"]);
export function normalizeTaskBoardBrandFilter(value: string | null): string | null {
  if (value == null || value.trim() === "") return null;
  if (!UUID.test(value)) throw new Error("INVALID_BRAND_FILTER");
  return value;
}
function dateOrNull(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function safeText(value: unknown, limit = 100): string {
  return String(value ?? "").slice(0, limit);
}

export async function hasNexusTaskBoardViewGrant(client: NexusTaskBoardQueryClient, brandId: string, verifiedUserId: string): Promise<boolean> {
  normalizeTaskBoardBrandFilter(brandId);
  normalizeTaskBoardBrandFilter(verifiedUserId);
  const result = await client.query(
    `select exists (
       select 1 from core.nexus_task_board_allowed_readers readers
       where readers.brand_id=$1::uuid and readers.user_id=$2::uuid
     ) as allowed`, [brandId,verifiedUserId]);
  return result.rows.length===1 && result.rows[0].allowed===true;
}

export async function loadNexusTaskBoard(client: NexusTaskBoardQueryClient, brandId: string | null = null, verifiedMemberUserId: string | null = null): Promise<NexusTaskBoardEntry[]> {
  if(verifiedMemberUserId!==null && brandId===null) throw new Error("NEXUS_MEMBER_BRAND_REQUIRED");
  const memberId=normalizeTaskBoardBrandFilter(verifiedMemberUserId);
  const brandFilter = normalizeTaskBoardBrandFilter(brandId);
  const result = await client.query(
    `select t.id::text as id,t.brand_id::text as brand_id,t.brand_key,
            t.status,t.version,t.action_type,t.evidence_count,
            t.quality_reviewed,t.preflight_passed,t.created_at,t.updated_at,
            t.review_decision,t.review_expires_at,t.reserved,t.events
       from core.nexus_task_board_entries t
      where ($1::uuid is null or t.brand_id=$1::uuid)
        and ($2::uuid is null or exists (
          select 1 from core.nexus_task_board_allowed_readers readers
          where readers.brand_id=t.brand_id and readers.user_id=$2::uuid
        ))
      order by t.updated_at desc,t.id desc
      limit 50`,
    [brandFilter,memberId],
  );
  if (!Array.isArray(result.rows)) throw new Error("NEXUS_TASK_BOARD_INVALID_DATA");
  return result.rows.map(row => {
    const id = String(row.id ?? "");
    const bid = String(row.brand_id ?? "");
    const version = Number(row.version);
    if (!UUID.test(id) || !UUID.test(bid) || !STATUSES.has(String(row.status)) ||
      !Number.isSafeInteger(version) || version < 1) throw new Error("NEXUS_TASK_BOARD_INVALID_DATA");
    // Defense in depth: never serialize a mismatched brand even if the SQL view,
    // mock, future database adapter or query optimizer supplies foreign rows.
    if (brandFilter && bid !== brandFilter) throw new Error("NEXUS_TASK_BOARD_BRAND_SCOPE_MISMATCH");
    const events = Array.isArray(row.events) ? row.events : [];
    const createdAt = dateOrNull(row.created_at);
    const updatedAt = dateOrNull(row.updated_at);
    if (!createdAt || !updatedAt) throw new Error("NEXUS_TASK_BOARD_INVALID_DATA");
    return {
      id,brandId:bid,brandKey:safeText(row.brand_key,80),
      status:String(row.status),version,actionType:safeText(row.action_type,120),
      evidenceCount:Math.max(0,Number(row.evidence_count)||0),
      qualityReviewed:row.quality_reviewed===true,
      preflightPassed:row.preflight_passed===true,
      reviewDecision:REVIEW_DECISIONS.has(String(row.review_decision))?String(row.review_decision):null,
      reviewExpiresAt:dateOrNull(row.review_expires_at),reserved:row.reserved===true,
      createdAt,updatedAt,
      events:events.slice(-30).flatMap((event: unknown)=>{
        const e=event && typeof event==="object" && !Array.isArray(event) ? event as Record<string,unknown> : {};
        const at=dateOrNull(e.at);
        return EVENT_TYPES.has(String(e.type))&&at?[{type:String(e.type),at}]:[];
      }),
    };
  });
}
