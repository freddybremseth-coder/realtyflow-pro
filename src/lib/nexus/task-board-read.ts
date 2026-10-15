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
       select 1 from core.nexus_execution_authorizations a
       join core.brand_workspace_memberships m
         on m.brand_id=a.brand_id and m.user_id=a.user_id
       where a.brand_id=$1::uuid and a.user_id=$2::uuid
         and a.capability='view' and a.enabled=true
         and m.status='active' and 'nexus.read'=any(m.permissions)
     ) as allowed`, [brandId,verifiedUserId]);
  return result.rows.length===1 && result.rows[0].allowed===true;
}

export async function loadNexusTaskBoard(client: NexusTaskBoardQueryClient, brandId: string | null = null, verifiedMemberUserId: string | null = null): Promise<NexusTaskBoardEntry[]> {
  if(verifiedMemberUserId!==null && brandId===null) throw new Error("NEXUS_MEMBER_BRAND_REQUIRED");
  const memberId=normalizeTaskBoardBrandFilter(verifiedMemberUserId);
  const brandFilter = normalizeTaskBoardBrandFilter(brandId);
  const result = await client.query(
    `select t.id::text as id, t.brand_id::text as brand_id, b.brand_key,
            t.status,t.version,t.action_type,cardinality(t.evidence_refs) as evidence_count,
            t.quality_reviewed,t.preflight_passed,t.created_at,t.updated_at,
            a.decision as review_decision,a.expires_at as review_expires_at,
            exists(select 1 from core.nexus_execution_claims c where c.task_id=t.id) as reserved,
            (select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'at', e.happened_at)
                order by e.happened_at), '[]'::jsonb)
             from core.nexus_execution_task_events e where e.task_id=t.id) as events
       from core.nexus_execution_tasks t
       join core.brands b on b.id=t.brand_id
       left join core.nexus_execution_approvals a
         on a.task_id=t.id and a.task_version=t.version
      where ($1::uuid is null or t.brand_id=$1::uuid)
        and ($2::uuid is null or exists (
          select 1 from core.nexus_execution_authorizations authz
          join core.brand_workspace_memberships membership
            on membership.brand_id=authz.brand_id and membership.user_id=authz.user_id
          where authz.brand_id=t.brand_id and authz.user_id=$2::uuid
            and authz.capability='view' and authz.enabled=true
            and membership.status='active' and 'nexus.read'=any(membership.permissions)
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
