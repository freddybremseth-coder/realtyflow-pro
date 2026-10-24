/**
 * Pure presentation logic for the owner/worker Altovena lead board.
 *
 * This is an IN-APP indicator only. No cross-session unread state, email,
 * push notification, lead mutation or independent alert-delivery guarantee.
 */
export type LeadAttentionSnapshot = Readonly<{
  id: string;
  status: "TO_DO" | "IN_PROGRESS" | "REVIEW";
  createdAt: string | null;
}>;

export type LeadAttentionAssessment = Readonly<{
  newArrivals: number;
  awaitingMoreThan24h: number;
  mightHaveMore: boolean;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function assessAltovenaLeadPoll(input: Readonly<{
  previousIds: ReadonlySet<string> | null;
  tasks: readonly LeadAttentionSnapshot[];
  capped: boolean;
  nowMs: number;
}>): LeadAttentionAssessment {
  const { previousIds, tasks, capped, nowMs } = input;
  // First successful poll is the baseline, not a newly delivered alert.
  const currentIds=new Set(tasks.map(task=>task.id));
  const newArrivals=previousIds===null ? 0 :
    [...currentIds].filter(id=>!previousIds.has(id)).length;
  const awaitingMoreThan24h=Number.isFinite(nowMs)?tasks.filter(task=>{
    if(task.status==="IN_PROGRESS" || !task.createdAt)return false;
    const created=Date.parse(task.createdAt);
    return Number.isFinite(created) && created<=nowMs &&
      nowMs-created >= DAY_MS;
  }).length:0;

  // capped=true only proves the query reached its limit, not total records.
  // Never report an exact count of all pending tasks.
  return {newArrivals,awaitingMoreThan24h,mightHaveMore:capped};
}
