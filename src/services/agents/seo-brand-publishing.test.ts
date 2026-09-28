import test from "node:test";
import assert from "node:assert/strict";
import { SEO_BRAND_PUBLISHERS, brandPublishingEvidence, patchBrandHtml, readBrandHtml, patchNextHomepage, readNextHomepageMetadata, readNextLayoutMetadata, secondVariantForBrand } from "./seo-brand-publishing";
import type { BrandPublisher } from "./seo-brand-publishing";
import type { GSCBrandSnapshot } from "./seo-search-console";
const now=new Date("2026-09-27T12:00:00Z");
export function snapshot(site:BrandPublisher):GSCBrandSnapshot {
  return {brandId:site.brandId,connected:true,property:site.origin+"/",collectedAt:now.toISOString(),
    period:{currentStart:"2026-08-26",currentEnd:"2026-09-24",previousStart:"2026-07-27",previousEnd:"2026-08-25"},
    metric:"Google Search Console web Search Analytics; grouped by canonical page",
    totals:{currentClicks:1,currentImpressions:150,previousClicks:0,previousImpressions:0,currentCtr:1/150,previousCtr:null},
    topPages:[{path:"/",clicks:1,impressions:150,ctr:1/150,position:8}],
    topQueryPages:[{page:"/",query:"relevant search",clicks:1,impressions:50,ctr:.02,position:8}],
    dataQuality:{truncated:false,queryRowsSampled:true,note:"measured"}};
}
test("seven explicit adapters supplement Zen; metadata is bounded and homepage routes are explicit",()=>{
  assert.equal(SEO_BRAND_PUBLISHERS.length,7);
  assert.equal(new Set(SEO_BRAND_PUBLISHERS.map(s=>s.brandId)).size,7);
  assert.equal(SEO_BRAND_PUBLISHERS.find(s=>s.brandId==="freddyb")?.file,"home.html");
  for(const site of SEO_BRAND_PUBLISHERS){
    assert.ok(site.title.length<=65); assert.ok(site.description.length<=160);
    assert.ok(brandPublishingEvidence(site,snapshot(site),now));
  }
});
test("evidence refuses missing, stale, future, wrong-site, non-root and incomplete data",()=>{
  const site=SEO_BRAND_PUBLISHERS[1];
  assert.equal(brandPublishingEvidence(site,null,now),null);
  const changes:Array<(s:GSCBrandSnapshot)=>void>=[
    s=>{s.brandId="zenecocare";},s=>{Object.assign(s,{connected:false});},s=>{s.property="https://evil.example/";},
    s=>{s.collectedAt="2026-08-01T00:00:00Z";},s=>{s.collectedAt="2026-10-01T00:00:00Z";},
    s=>{s.period.currentEnd="2026-09-01";},s=>{s.period.currentStart="invalid";},
    s=>{s.dataQuality.truncated=true;},s=>{s.dataQuality.queryRowsSampled=false;},
    s=>{s.topQueryPages[0].page="/other";},s=>{s.topQueryPages[0].impressions=39;},
    s=>{s.topPages[0].impressions=99;},s=>{s.topQueryPages[0].impressions=Infinity;},
    s=>{s.topQueryPages[0].ctr=.04;},s=>{s.topQueryPages[0].clicks=-1;},
  ];
  for(const mutate of changes){const s=snapshot(site);mutate(s);assert.equal(brandPublishingEvidence(site,s,now),null);}
  const child=SEO_BRAND_PUBLISHERS[2],s=snapshot(child);s.property="sc-domain:freddybremseth.com";
  assert.ok(brandPublishingEvidence(child,s,now));s.property="https://www.freddybremseth.com/";
  assert.equal(brandPublishingEvidence(child,s,now),null);
});
const before={title:"Before & after",description:"Before description"};
const html='<html><head><!-- <title>fake</title> --><script>const x="<title>fake</title>";</script><title>Before &amp; after</title><meta name="description" content="Before description"><link rel="canonical" href="https://example.test/"></head><body>Exact body and price €890</body></html>';
test("HTML adapter changes only title and description, escaping copy and preserving other bytes",()=>{
  const after={title:'A < B & "C"',description:"It's valid & true"};
  const patched=patchBrandHtml(html,before,after),read=readBrandHtml(patched);
  assert.equal(read?.title,after.title);assert.equal(read?.description,after.description);
  assert.equal(read?.canonical,"https://example.test/");
  assert.ok(patched.endsWith('<body>Exact body and price €890</body></html>'));
  assert.equal(patchBrandHtml(patched,after,before),html);
  assert.throws(()=>patchBrandHtml(patched,before,after),/changed/);
  assert.equal(readBrandHtml(html.replace('</head>','<title>duplicate</title></head>')),null);
  assert.equal(readBrandHtml(html.replace('<link','<meta name="robots" content="noindex"><link'))?.noindex,true);
  assert.equal(readBrandHtml('<body><title>spoof</title></body>'),null);
});
test("Next adapter is reversible, chainable and refuses pre-existing or changed metadata",()=>{
  const original='import Link from "next/link";\nexport default function Home() { return null; }';
  const patched=patchNextHomepage(original,before);
  assert.deepEqual(readNextHomepageMetadata(patched),before);
  const second=secondVariantForBrand("pinosoecolife");
  const repatched=patchNextHomepage(patched,second,before);
  assert.deepEqual(readNextHomepageMetadata(repatched),second);
  assert.equal(patchNextHomepage(repatched,null,second),original);
  assert.equal(patchNextHomepage(patched,null,before),original);
  assert.throws(()=>patchNextHomepage(patched,before),/revision/);
  assert.throws(()=>patchNextHomepage(patched,null,{...before,title:"changed"}),/revision/);
  assert.throws(()=>patchNextHomepage('export async function generateMetadata() {}',before),/dedicated/);
  assert.deepEqual(readNextLayoutMetadata('export const metadata: Metadata = {\n title: { default: "Old title" },\n description: "Old description",\n};'),{title:"Old title",description:"Old description"});
});
