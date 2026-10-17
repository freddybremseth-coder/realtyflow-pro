/**
 * Altovena Visibility -> bounded change DESIGN proposal, never an execution
 * plan or an authorization to publish. Source: separate, service-only public
 * recheck log, not the client or mutable work_items metadata.
 */
import { createHash } from "node:crypto";
import { VISIBILITY_BRANDS } from "@/lib/visibility-product";

export const DESIGN_REQUEST_ACTION = "visibility_remediation_design_request";
export type DesignStatus =
 | "AWAITING_RECHECK" | "INVESTIGATE_ONLY"
 | "SPECIALIST_REVIEW" | "READY_FOR_DESIGN_REVIEW";
type Evidence = {
 work_item_id?: unknown; source_id?: unknown; brand_id?: unknown;
 result?: unknown; issue_code?: unknown; checked_at?: unknown;
 target_origin?: unknown; read_only?: unknown;
 publication_authorized?: unknown; resolution_verified?: unknown;
 evidence?: {homepageStatus?:unknown;h1Count?:unknown;incomplete?:unknown};
};
export type DesignTask = {
 id:string; brand_id:string; source_id:string; status:string;
 metadata?:{product?:unknown;category?:unknown;target_url?:unknown}|null;
};
export type DesignProposal = {
 status:DesignStatus; workItemId:string; brandId:string; sourceId:string;
 issueCode:string|null; evidenceAt:string|null; target:string|null;
 reason:string; change:string|null; verification:string[];
 rollback:string|null; fingerprint:string|null; canRequestDraft:boolean;
 approvalRequired:true; executionStarted:false; publicationAuthorized:false;
};

const H1_VERIFICATION=[
 "Kontroller at nøyaktig én meningsfull H1 finnes i serverlevert offentlig HTML.",
 "Sammenlign H1-teksten med nettstedets synlige hovedoverskrift; ikke dikt opp innhold.",
 "Sjekk mobilvisning, intern lenkestruktur og at ingen andre sider påvirkes.",
 "Kjør full bygging og uavhengig kontroll på den eksakte offentlige URL-en etter en eventuell utgivelse.",
];

function safeOrigin(brandId:string, origin:unknown):string|null{
 const allowed=VISIBILITY_BRANDS[brandId]?.domain;
 if(!allowed || typeof origin!=="string")return null;
 try{
  const u=new URL(origin);
  if(u.protocol!=="https:"||u.username||u.password||u.port||
   (u.hostname!==allowed&&u.hostname!==`www.${allowed}`)||u.pathname!=="/"||u.search||u.hash)return null;
  return u.origin;
 }catch{return null;}
}

export function createVisibilityDesignProposal(task:DesignTask, evidence:Evidence|null|undefined, now=new Date()):DesignProposal{
 const base={
  workItemId:task.id,brandId:task.brand_id,sourceId:task.source_id,
  issueCode:null as string|null,evidenceAt:null as string|null,target:null as string|null,
  change:null as string|null,verification:[] as string[],rollback:null as string|null,
  fingerprint:null as string|null,canRequestDraft:false,
  approvalRequired:true as const,executionStarted:false as const,publicationAuthorized:false as const,
 };
 const fail=(status:DesignStatus,reason:string):DesignProposal=>({...base,status,reason});
 if(task.status==="CANCELLED"||task.status==="DONE"||
    task.metadata?.product!=="altovena_visibility"||
    !task.source_id.startsWith(`visibility:${task.brand_id}:`))
  return fail("AWAITING_RECHECK","Oppgaven er ikke åpen og gyldig for Visibility-utkast.");
 if(!evidence || evidence.work_item_id!==task.id ||
    evidence.source_id!==task.source_id||evidence.brand_id!==task.brand_id||
    evidence.read_only!==true||evidence.publication_authorized!==false||
    evidence.resolution_verified!==false)
  return fail("AWAITING_RECHECK","Venter på dokumentert, uavhengig måling fra Sam.");
 const at=typeof evidence.checked_at==="string"?Date.parse(evidence.checked_at):NaN;
 if(!Number.isFinite(at)||now.getTime()-at>24*3600000||at-now.getTime()>15*60000)
  return fail("AWAITING_RECHECK","Målingen er utløpt eller datert feil. Kontroller på nytt.");
 if(evidence.result!=="OBSERVED_AGAIN")
  return fail("INVESTIGATE_ONLY","Kontrollen bekreftet ikke et reparerbart avvik. Undersøk før endringsutkast.");
 const origin=safeOrigin(task.brand_id,evidence.target_origin);
 if(!origin)return fail("AWAITING_RECHECK","Målingen gjelder ikke en godkjent offentlig hjemmeside.");
 const issueCode=typeof evidence.issue_code==="string"?evidence.issue_code:null;
 if(issueCode!=="HEADING_STRUCTURE"||task.metadata?.category!=="technical")
  return fail("SPECIALIST_REVIEW","Dette SEO-avviket må vurderes av fagperson før kodeendring kan foreslås.");
 if(evidence.evidence?.homepageStatus!==200||
    evidence.evidence?.h1Count!==0||evidence.evidence?.incomplete!==false)
  return fail("INVESTIGATE_ONLY","Målingen gir ikke entydig bevis for manglende H1 på offentlig hjemmeside.");
 const targetValue=typeof task.metadata?.target_url==="string"?task.metadata.target_url:null;
 if(targetValue){
  try{
   const u=new URL(targetValue);
   if(u.protocol!=="https:"||u.username||u.password||u.port||u.origin!==origin||
     (u.pathname!=="/"&&u.pathname!=="")||u.search||u.hash)
    return fail("AWAITING_RECHECK","Oppgavens mål samsvarer ikke med den kontrollerte hjemmesiden.");
  }catch{return fail("AWAITING_RECHECK","Oppgavens mål er ikke gyldig.");}
 }
 const change="Utarbeid et avgrenset kodeutkast som gir den eksisterende synlige hovedoverskriften semantisk H1 i serverlevert HTML på forsiden. Ingen ny markedsføringstekst eller automatisk publisering.";
 const rollback="Før endring: dokumenter kildeversjon og reverseringsmetode. En eventuell implementering må kunne tilbakestilles som én isolert commit.";
 const fingerprint=createHash("sha256").update(JSON.stringify({
   task:task.id,source:task.source_id,brand:task.brand_id,origin,
   checkedAt:evidence.checked_at,code:issueCode,change,verification:H1_VERIFICATION,rollback,
 })).digest("hex");
 return {...base,status:"READY_FOR_DESIGN_REVIEW",reason:"Bekreftet på ny offentlig kontroll. Kun kodeutkast kan etterspørres.",
  issueCode,evidenceAt:evidence.checked_at as string,target:origin,change,
  verification:H1_VERIFICATION,rollback,fingerprint,canRequestDraft:true};
}
