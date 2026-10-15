import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publisherForBrand, type BrandPublisher, type BrandMetadata } from "./seo-brand-publishing";

/** Owner permission is bound to one brand, homepage, publisher, experiment and
 * exact title/description. It cannot override source/public or CI safeguards. */
const ACTION = "visibility_owner_metadata_approval_v1";
const GRANT_DAYS = 30;
const BRAND = "donaanna" as const;
const VERSION = "v1" as const;

export type VisibilityApproval = {
  brandId: typeof BRAND;
  version: typeof VERSION;
  scope: "homepage_title_description";
  origin: string;
  repository: string;
  file: string;
  title: string;
  description: string;
  fingerprint: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  decision: "approved" | "revoked";
};
const HASH_NAMESPACE = "altovena-visibility-metadata-v1";
export function visibilityApprovalId() {
  const hex=createHash("sha256").update(HASH_NAMESPACE+":"+BRAND+":"+VERSION).digest("hex");
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-4"+hex.slice(13,16)+"-a"+hex.slice(17,20)+"-"+hex.slice(20,32);
}
export function visibilityApprovalScope() {
  const site = publisherForBrand(BRAND);
  if (!site) throw new Error("Doña Anna publisher not configured");
  const target: BrandMetadata = site;
  const fingerprint=createHash("sha256")
    .update(JSON.stringify([HASH_NAMESPACE,BRAND,VERSION,site.origin,site.repository,site.file,target.title,target.description]))
    .digest("hex");
  return { brandId: BRAND,version:VERSION,scope:"homepage_title_description" as const,
    origin:site.origin,repository:site.repository,file:site.file,
    title:target.title,description:target.description,fingerprint };
}
export function validVisibilityApproval(data: unknown, now: Date = new Date()): data is VisibilityApproval {
  const a=data as Partial<VisibilityApproval> | null;
  if (!a || typeof a !== "object") return false;
  const scope=visibilityApprovalScope();
  const approved=Date.parse(a.approvedAt||"");
  const expires=Date.parse(a.expiresAt||"");
  return a.decision==="approved" &&
    a.brandId===scope.brandId && a.version===scope.version && a.scope===scope.scope &&
    a.repository===scope.repository && a.file===scope.file && a.origin===scope.origin &&
    a.title===scope.title && a.description===scope.description && a.fingerprint===scope.fingerprint &&
    typeof a.approvedBy==="string" && a.approvedBy.length>3 &&
    Number.isFinite(approved) && Number.isFinite(expires) &&
    approved<=now.getTime()+60_000 && expires>now.getTime() && expires<=approved+GRANT_DAYS*86400_000+60_000;
}
export async function getVisibilityApproval(db: SupabaseClient, now = new Date()) {
  const r=await db.from("automation_logs").select("details").eq("id",visibilityApprovalId())
    .eq("action",ACTION).maybeSingle();
  if (r.error) throw new Error("Visibility owner consent state unavailable");
  const details=r.data?.details;
  return { approved:validVisibilityApproval(details,now),
    approvedAt:validVisibilityApproval(details,now)?details.approvedAt as string:null,
    expiresAt:validVisibilityApproval(details,now)?details.expiresAt as string:null };
}
export async function recordVisibilityApproval(db: SupabaseClient,input:{
  action:"approve"|"revoke"; expectedFingerprint:string; ownerEmail:string; now?:Date
}) {
  const scope=visibilityApprovalScope();
  if (input.expectedFingerprint!==scope.fingerprint) throw new Error("Approval scope has changed");
  if (!input.ownerEmail || !input.ownerEmail.includes("@")) throw new Error("Verified owner identity required");
  const now=input.now||new Date();
  const details:VisibilityApproval={...scope,approvedBy:input.ownerEmail.toLowerCase(),
    approvedAt:now.toISOString(),expiresAt:new Date(+now+GRANT_DAYS*86400_000).toISOString(),
    decision:input.action==="approve"?"approved":"revoked"};
  // Durable record in the existing append/audit infrastructure, no new table.
  // Upsert this exact deterministic record; concurrent requests do not create
  // multiple "approval" identities or widen page/brand scope.
  const {error}=await db.from("automation_logs").upsert({
    id:visibilityApprovalId(),action:ACTION,agent_name:"Altovena Visibility",
    status:input.action==="approve"?"success":"partial",details,
  },{onConflict:"id"});
  if(error) throw new Error("Could not persist owner consent");
  return {approved:input.action==="approve",approvedAt:details.approvedAt,
    expiresAt:input.action==="approve"?details.expiresAt:null};
}
export async function canRunApprovedDonaAnnaMetadata(
  db:SupabaseClient,site:BrandPublisher,version:"v1"|"v2",now=new Date()
):Promise<boolean>{
  if(site.brandId!==BRAND) return true;
  if(version!=="v1") return false; // A later variant needs a new exact approval.
  return (await getVisibilityApproval(db,now)).approved;
}
