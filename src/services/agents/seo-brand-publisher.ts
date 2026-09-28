import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCBrandSnapshot } from "./seo-search-console";
import { brandPublishingEvidence, patchBrandHtml, patchNextHomepage, publisherForBrand, readBrandHtml,
  readNextLayoutMetadata, SEO_BRAND_PUBLISHERS, type BrandEvidence, type BrandMetadata, type BrandPublisher } from "./seo-brand-publishing";
import { githubForSite, githubRequest, type GithubRequest } from "./seo-brand-github";

const ACTION = "seo_brand_publication_v1";
export type BrandPublicationStatus = {
  brandId: string; status: "monitor" | "blocked" | "pending" | "verified" | "rollback";
  reason: string; published: number; page: "/"; jobId?: string; pullUrl?: string;
  rollbackAvailable?: boolean; revision?: string;
};
type Phase = "prepare" | "checks" | "deploy" | "rollback_prepare" | "rollback_checks" | "rollback_deploy" | "done" | "rolled_back";
export type BrandPublicationJob = {
  brandId: string; phase: Phase; baseSha: string; before: BrandMetadata;
  baseline: BrandEvidence; createdAt: string; pullNumber?: number; mergeSha?: string; mergedAt?: string;
  rollbackRequestedAt?: string; originalMergeSha?: string;
};
export function brandPublicationId(brandId: string, suffix = "") {
  const hash = createHash("sha256").update(ACTION + ":" + brandId + suffix).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export async function readBrandPublicHtml(site: BrandPublisher): Promise<string> {
  const response = await fetch(site.origin + "/", { cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(7000), headers: { Accept: "text/html", "User-Agent": "RealtyFlow-Sam-SEO/1.0" } });
  if (response.status !== 200 || !/text\/html/i.test(response.headers.get("content-type") || "") ||
      /\bnoindex\b/i.test(response.headers.get("x-robots-tag") || "")) throw new Error("Public HTML not eligible");
  const html = await response.text();
  if (html.length > 600000) throw new Error("Public HTML exceeds verification bound");
  return html;
}
function same(a: BrandMetadata | null, b: BrandMetadata) { return a?.title === b.title && a.description === b.description; }
function publicMatches(html: string, site: BrandPublisher, metadata: BrandMetadata) {
  const current = readBrandHtml(html);
  return Boolean(current && !current.noindex && (current.canonical === site.origin + "/" || current.canonical === site.origin) && same(current, metadata));
}
function validJob(job: BrandPublicationJob, site: BrandPublisher) {
  return job.brandId === site.brandId && ["prepare","checks","deploy","rollback_prepare","rollback_checks","rollback_deploy","done","rolled_back"].includes(job.phase) &&
    /^[a-f0-9]{40}$/.test(job.baseSha) && typeof job.before?.title === "string" && job.before.title.length <= 500 &&
    typeof job.before.description === "string" && job.before.description.length <= 1000 && Number.isFinite(Date.parse(job.createdAt)) &&
    typeof job.baseline?.query === "string" && job.baseline.query.length > 0 && job.baseline.query.length <= 180 &&
    Number.isFinite(job.baseline.impressions) && Number.isFinite(job.baseline.clicks) && Number.isFinite(job.baseline.position) &&
    /^\d{4}-\d{2}-\d{2}$/.test(job.baseline.start) && /^\d{4}-\d{2}-\d{2}$/.test(job.baseline.end) &&
    (job.pullNumber === undefined || Number.isInteger(job.pullNumber) && job.pullNumber > 0) &&
    (job.mergeSha === undefined || /^[a-f0-9]{40}$/.test(job.mergeSha));
}

/** One immutable experiment per configured homepage/variant. The deterministic
 * primary key claims work BEFORE GitHub writes, even across concurrent crons. */
export async function runBrandPublisher(
  db: SupabaseClient, site: BrandPublisher, snapshot: GSCBrandSnapshot | null,
  dependencies: { github: GithubRequest; publicHtml: (site: BrandPublisher) => Promise<string>; now: Date },
): Promise<BrandPublicationStatus> {
  const id = brandPublicationId(site.brandId), gh = githubForSite(site, dependencies.github), now = dependencies.now;
  const result = (status: BrandPublicationStatus["status"], reason: string, extra: Partial<BrandPublicationStatus> = {}): BrandPublicationStatus =>
    ({ brandId: site.brandId, page: "/", status, reason, published: 0, jobId: id, ...extra });
  const loaded = await db.from("automation_logs").select("details").eq("id",id).eq("action",ACTION).maybeSingle();
  if (loaded.error) throw new Error("Publication state unavailable");
  let job: BrandPublicationJob | null = loaded.data?.details as BrandPublicationJob || null;
  const save = async (previous: Phase, next: BrandPublicationJob) => {
    const saved = await db.from("automation_logs").update({ details: next,
      status: ["done","rolled_back"].includes(next.phase) ? "success" : "partial" })
      .eq("id",id).eq("action",ACTION).contains("details",{phase:previous}).select("id");
    if (saved.error) throw new Error("Publication progress could not be stored");
    return saved.data?.length === 1;
  };
  if (!job) {
    const repo = await gh.call("GET", "");
    if (repo?.full_name?.toLowerCase() !== site.repository.toLowerCase() || repo.default_branch !== "main" || repo.permissions?.push !== true)
      return result("blocked", "GitHub-tilgang til riktig repo og hovedgren er ikke verifisert.");
    const baseSha = await gh.main();
    const [source, html] = await Promise.all([gh.file(site.file,baseSha), dependencies.publicHtml(site)]);
    const before = site.adapter === "html" ? readBrandHtml(source.content)
      : readNextLayoutMetadata((await gh.file(site.layout,baseSha)).content);
    if (!before || !publicMatches(html,site,before)) return result("blocked", "Kildens metadata samsvarer ikke med offentlig hovedside. Ingen automatisk endring.");
    if (same(before,site)) return result("monitor", "Den godkjente metadatavarianten er allerede synlig.");
    // Validate the adapter even when traffic is too low to publish.
    if (site.adapter === "next-home") patchNextHomepage(source.content,site);
    const baseline = brandPublishingEvidence(site,snapshot,now);
    if (!baseline) return result("monitor", "Publiseringskilde kontrollert. Venter på tilstrekkelig søkesignal for hovedsiden.");
    job = { brandId:site.brandId,phase:"prepare",baseSha,before:{title:before.title,description:before.description},baseline,createdAt:now.toISOString() };
    const claim = await db.from("automation_logs").insert({ id, action:ACTION,agent_name:"Sam SEO Expert",status:"partial",details:job });
    if (claim.error) {
      if (claim.error.code === "23505") return result("pending", "En annen kjøring har allerede registrert dette forsøket.");
      throw new Error("Cannot record publication intent; no GitHub write attempted");
    }
  }
  if (!validJob(job,site)) return result("blocked", "Ufullstendig publiseringslogg må kontrolleres.");
  if (job.phase === "done") return result("verified", "Publiseringen er tidligere verifisert. Effektmålingen følges videre.",
    { rollbackAvailable:true,revision:job.mergeSha });
  if (job.phase === "rolled_back") return result("rollback", "Tidligere metadata er gjenopprettet og bekreftet offentlig.");
  const rollback = job.phase.startsWith("rollback_");
  const branch = "codex/sam-seo-" + site.brandId + "-v1" + (rollback ? "-rollback" : "");
  const targetMetadata = rollback ? job.before : site;
  const sourceMetadata = rollback ? site : job.before;
  const patch = (source: string) => site.adapter === "html" ? patchBrandHtml(source,sourceMetadata,targetMetadata)
    : rollback ? patchNextHomepage(source,null,site) : patchNextHomepage(source,site);

  if (job.phase === "prepare" || job.phase === "rollback_prepare") {
    const base = rollback ? await gh.main() : job.baseSha;
    const original = await gh.file(site.file,base);
    const next = patch(original.content);
    // Branch create is idempotent. Never force-reset a branch after a retry.
    try { await gh.call("POST", "/git/refs", { ref:"refs/heads/"+branch,sha:base }); }
    catch { await gh.call("GET", "/git/ref/heads/"+branch); }
    const current = await gh.file(site.file,branch);
    if (current.content !== next) {
      if (current.content !== original.content) return result("blocked", "Arbeidsgrenen inneholder en annen endring. Sam overskriver den ikke.");
      await gh.call("PUT", "/contents/"+site.file, { message:"Sam SEO: "+(rollback?"restore":"optimize")+" homepage metadata",
        content:Buffer.from(next).toString("base64"),sha:current.sha,branch });
    }
    const findPull = () => gh.call("GET", "/pulls?state=all&head=freddybremseth-coder:"+branch+"&base=main&per_page=10");
    let pulls = await findPull();
    let pull = pulls.find((p:any)=>p.head?.ref===branch && p.base?.ref==="main");
    if (!pull) {
      try { pull = await gh.call("POST", "/pulls", { head:branch,base:"main",
        title:"Sam SEO · "+site.brandId+" · "+(rollback?"tilbakeføring":"metadata på hovedsiden"),
        body:"Automatisk avgrenset metadataendring fra RealtyFlow. Kun tittel og metabeskrivelse på "+site.origin+"/.\n\nEndringen skal passere GitHub- og Vercel-kontroller før sammenslåing. Sam verifiserer offentlig HTML etter publisering. Ingen priser, sideinnhold, canonical eller kundedata endres." }); }
      catch { pulls = await findPull(); pull = pulls.find((p:any)=>p.head?.ref===branch && p.base?.ref==="main"); if (!pull) throw new Error("Publication PR could not be created"); }
    }
    if (pull.state === "closed" && !pull.merged_at) return result("blocked", "Publiseringsforslaget er lukket. Sam åpner det ikke på nytt.");
    await save(job.phase,{...job,phase:rollback?"rollback_checks":"checks",baseSha:base,pullNumber:pull.number});
    return result("pending", "Endringsforslag opprettet. Sam venter på grønne bygg og publiseringskontroller.",{pullUrl:pull.html_url});
  }
  if (job.phase === "checks" || job.phase === "rollback_checks") {
    if (!job.pullNumber) return result("blocked", "Publiseringsforslag mangler i loggen.");
    const pull = await gh.call("GET", "/pulls/"+job.pullNumber);
    if (pull.head?.repo?.full_name?.toLowerCase() !== site.repository.toLowerCase() || pull.head?.ref !== branch || pull.base?.ref !== "main" || pull.base?.repo?.full_name?.toLowerCase() !== site.repository.toLowerCase())
      return result("blocked", "Publiseringsforslaget peker på feil gren eller repo.");
    if (pull.merged) {
      await save(job.phase,{...job,phase:rollback?"rollback_deploy":"deploy",mergeSha:pull.merge_commit_sha,mergedAt:pull.merged_at});
      return result("pending","Sammenslåing registrert. Venter på offentlig verifisering.",{pullUrl:pull.html_url});
    }
    if (pull.state !== "open") return result("blocked","Publiseringsforslaget er lukket.",{pullUrl:pull.html_url});
    // A PR can wait days for checks. A stored intent is not permission to
    // publish after its Google evidence has disappeared or expired.
    if (!rollback && !brandPublishingEvidence(site, snapshot ? {...snapshot,
      topQueryPages: snapshot.topQueryPages.filter(row=>row.query===job!.baseline.query)} : null, now))
      return result("pending","Venter på ferske Google-tall som fortsatt støtter dette forsøket.",{pullUrl:pull.html_url});
    const main = await gh.main();
    if (main !== job.baseSha) {
      // Check exact metadata before allowing the normal Git merge to preserve
      // unrelated changes. Never force-push or replace the main branch.
      patch((await gh.file(site.file,main)).content);
      await gh.call("POST","/merges",{base:branch,head:main,commit_message:"Refresh Sam SEO against current main"});
      await save(job.phase,{...job,baseSha:main});
      return result("pending","Arbeidsgrenen er oppdatert mot siste hovedgren; nye kontroller avventes.",{pullUrl:pull.html_url});
    }
    const [mainFile, branchFile, files] = await Promise.all([gh.file(site.file,main),gh.file(site.file,pull.head.sha),
      gh.call("GET","/pulls/"+job.pullNumber+"/files?per_page=100")]);
    if (files.length !== 1 || files[0].filename !== site.file || files[0].status !== "modified" || branchFile.content !== patch(mainFile.content))
      return result("blocked","Forslaget inneholder mer enn den godkjente metadataendringen.",{pullUrl:pull.html_url});
    if (!await gh.green(pull.head.sha)) return result("pending","Venter på grønne GitHub- og Vercel-kontroller.",{pullUrl:pull.html_url});
    if (await gh.main() !== main) return result("pending","Hovedgrenen flyttet seg; ny kontroll kjøres neste gang.");
    const merged = await gh.call("PUT","/pulls/"+job.pullNumber+"/merge",{sha:pull.head.sha,merge_method:"squash"});
    if (!merged.merged) return result("blocked","GitHub tillot ikke automatisk sammenslåing.",{pullUrl:pull.html_url});
    await save(job.phase,{...job,phase:rollback?"rollback_deploy":"deploy",mergeSha:merged.sha,mergedAt:now.toISOString()});
    return result("pending","Endringen er slått sammen; faktisk nettsidevisning kontrolleres videre.",{pullUrl:pull.html_url});
  }
  if (!job.mergeSha || !job.mergedAt || !Number.isFinite(Date.parse(job.mergedAt))) return result("blocked","Publiseringsrevisjon mangler.");
  const [html, green] = await Promise.all([dependencies.publicHtml(site).catch(()=>""),gh.green(job.mergeSha)]);
  if (green && publicMatches(html,site,targetMetadata)) {
    if (!rollback) {
      // Deterministic primary key makes effect logging retryable and deduplicated.
      const effect = await db.from("automation_logs").upsert({ id:brandPublicationId(site.brandId,":effect"),
        action:"seo_autopilot_change",agent_name:"Sam SEO Expert",status:"success",details:{
          change_id:"sam_"+site.brandId+"_homepage_v1",brand_id:site.brandId,page:"/",query:job.baseline.query,
          commit_sha:job.mergeSha,applied_at:job.mergedAt,site_verified:true,publisher:"github_metadata_v1",
          baseline_period_start:job.baseline.start,baseline_period_end:job.baseline.end,
          baseline_impressions:job.baseline.impressions,baseline_clicks:job.baseline.clicks,baseline_position:job.baseline.position,
        } },{onConflict:"id",ignoreDuplicates:true});
      if (effect.error) throw new Error("Effect measurement could not be stored; will retry");
    }
    if (rollback) {
      const closed = await db.from("automation_logs").update({status:"partial"})
        .eq("id",brandPublicationId(site.brandId,":effect")).eq("action","seo_autopilot_change");
      if (closed.error) throw new Error("Restored experiment measurement could not be closed; will retry");
    }
    const saved = await save(job.phase,{...job,phase:rollback?"rolled_back":"done"});
    return result(rollback?"rollback":"verified",rollback?"Tilbakeføringen er verifisert på nettstedet.":"Endringen er bekreftet offentlig og registrert for effektmåling.",
      {published:!rollback&&saved?1:0,rollbackAvailable:!rollback,revision:job.mergeSha});
  }
  if (!rollback && +now-Date.parse(job.mergedAt) >= 72*3600000) {
    await save(job.phase,{...job,phase:"rollback_prepare",originalMergeSha:job.mergeSha,rollbackRequestedAt:now.toISOString()});
    return result("pending","Endringen kunne ikke verifiseres innen 72 timer. Automatisk tilbakeføring er satt i kø.");
  }
  return result("pending",rollback?"Tilbakeføringen avventer verifisert offentlig resultat.":"Venter på at nettstedet viser den publiserte endringen.");
}

export async function runPortfolioPublishers(db: SupabaseClient, snapshots: readonly GSCBrandSnapshot[]): Promise<BrandPublicationStatus[]> {
  const token=process.env.GITHUB_TOKEN;
  if (!token) return SEO_BRAND_PUBLISHERS.map(site=>({brandId:site.brandId,page:"/",status:"blocked",reason:"Serverens GitHub-tilgang mangler.",published:0}));
  const github=githubRequest(token), now=new Date();
  // Different brands may share a repository/main. Advance those sequentially
  // so their green checks cannot race each other into a stale-base merge.
  const repositories = [...new Set(SEO_BRAND_PUBLISHERS.map(site=>site.repository))];
  const groups = await Promise.all(repositories.map(async repository => {
    const results: BrandPublicationStatus[] = [];
    for (const site of SEO_BRAND_PUBLISHERS.filter(item=>item.repository===repository)) {
      try { results.push(await runBrandPublisher(db,site,snapshots.find(s=>s.brandId===site.brandId)||null,{github,publicHtml:readBrandPublicHtml,now})); }
      catch(error) { results.push({brandId:site.brandId,page:"/",status:"blocked",published:0,
        reason:"Publiseringskontrollen må prøves igjen: "+(error instanceof Error?error.message:"ukjent feil").slice(0,180)}); }
    }
    return results;
  }));
  return SEO_BRAND_PUBLISHERS.map(site=>groups.flat().find(result=>result.brandId===site.brandId)!);
}

export async function requestBrandRollback(db: SupabaseClient, brandId: string, revision: string) {
  const site=publisherForBrand(brandId);
  if (!site || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Unknown brand or revision");
  const id=brandPublicationId(brandId);
  const row=await db.from("automation_logs").select("details").eq("id",id).eq("action",ACTION).maybeSingle();
  const job=row.data?.details as BrandPublicationJob;
  if (row.error || !job || !validJob(job,site) || job.phase!=="done" || job.mergeSha!==revision) return false;
  const saved=await db.from("automation_logs").update({status:"partial",details:{...job,phase:"rollback_prepare",
    originalMergeSha:revision,rollbackRequestedAt:new Date().toISOString()}}).eq("id",id).eq("action",ACTION)
    .contains("details",{phase:"done",mergeSha:revision}).select("id");
  if (saved.error) throw new Error("Rollback request could not be stored");
  return saved.data?.length===1;
}

/** Always show all configured brands; no saved execution is explicitly unmeasured.
 * Read durable rollback intent as well as the last daily report, so a reload
 * cannot present a queued rollback as an active successful experiment. */
export async function portfolioPublicationStatuses(db: SupabaseClient, last: unknown): Promise<BrandPublicationStatus[]> {
  const rows = await db.from("automation_logs").select("id,details").eq("action",ACTION)
    .in("id",SEO_BRAND_PUBLISHERS.map(site=>brandPublicationId(site.brandId)));
  if (rows.error) throw new Error("Publication status unavailable");
  return SEO_BRAND_PUBLISHERS.map(site => {
    const job = rows.data?.find(row=>row.id===brandPublicationId(site.brandId))?.details as BrandPublicationJob | undefined;
    const saved = Array.isArray(last) ? last.find(item=>item?.brandId===site.brandId) as BrandPublicationStatus | undefined : undefined;
    const common = {brandId:site.brandId,page:"/" as const,published:0};
    if (job && validJob(job,site)) {
      if (job.phase === "rolled_back") return {...common,status:"rollback",reason:"Tidligere metadata er gjenopprettet og bekreftet offentlig."};
      if (job.phase.startsWith("rollback_") && saved?.status === "blocked") return saved;
      if (job.phase.startsWith("rollback_")) return {...common,status:"pending",reason:"Tilbakeføring er satt i kø. Sam følger den opp i den daglige syklusen."};
      if (job.phase === "done") return {...common,status:"verified",reason:"Publisering bekreftet offentlig. Sam følger effektmålingen videre.",rollbackAvailable:true,revision:job.mergeSha};
      if (saved?.status === "blocked") return saved;
      return {...common,status:"pending",reason:job.phase === "prepare"
        ? "Metadataforsøket er registrert. Sam følger opp endringsforslaget automatisk."
        : job.phase === "checks" ? "Endringsforslaget avventer ferske søketall og grønne publiseringskontroller."
        : "Endringen er slått sammen. Sam avventer bekreftet offentlig resultat.",
        ...(job.pullNumber ? {pullUrl:"https://github.com/"+site.repository+"/pull/"+job.pullNumber} : {})};
    }
    return saved || {...common,status:"monitor",reason:"Konfigurert for automatisk kontroll. Publiseringsadgang er ennå ikke målt i en daglig syklus."};
  });
}
