import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { SEOControlReport } from "@/services/agents/seo-control-report";
import { VisibilityProjectReviewPanel } from "./visibility-project-review-panel";

const report = {
 checkedAt:"2026-10-18T00:00:00Z",
 sites:[{brandId:"zeneco",checkedAt:"2026-10-18T00:00:00Z",projectReviewCandidates:[{
  url:"https://www.zenecohomes.com/eiendommer/example",
  status:"NOT_REVIEWED",hasHttpEvidence:true,factsVerified:false,publicationEligible:false,
  claimMentions:{priceMention:true,deliveryMention:false,energyMention:false,taxMention:true,verified:false},
 }]}],
} as unknown as SEOControlReport;
const draw = (r:SEOControlReport|null,brand="all",demo=false) =>
 renderToStaticMarkup(createElement(VisibilityProjectReviewPanel,{report:r,brand,demo}));

test("project price mentions are displayed as unverified, never approved",()=>{
 const html=draw(report);
 assert.match(html,/Prosjektfakta og kildekontroll/);
 assert.match(html,/Ikke faktakontrollert/);
 assert.match(html,/Pris omtalt/);
 assert.match(html,/Avgifter omtalt/);
 assert.match(html,/Publisering: sperret/);
 assert.match(html,/Hva skal jeg gjøre nå/);
 assert.match(html,/Gå til Sam SEO og kontrollrapporter/);
 assert.match(html,/https:\/\/www\.zenecohomes\.com\/eiendommer\/example/);
 assert.doesNotMatch(html,/Godkjenn publisering|Fakta verifisert/);
});
test("unknown report and no sampled projects never imply a passing grade",()=>{
 assert.match(draw(null),/Fravær av målinger betyr ikke/);
 const empty={...report,sites:[{brandId:"zeneco",projectReviewCandidates:[]}] } as unknown as SEOControlReport;
 assert.match(draw(empty),/øvrige prosjektsider er kontrollert eller feilfrie/);
});
test("brand selection does not show ZenEco evidence on unrelated brand",()=>{
 const html=draw(report,"donaanna");
 assert.match(html,/avgrenset til Zen Eco Homes/);
 assert.doesNotMatch(html,/Prosjektside 1/);
});
test("untrusted destinations are not rendered as clickable external links",()=>{
 const unsafe={...report,sites:[{brandId:"zeneco",projectReviewCandidates:[{
  url:"https://external.example/properties/1",status:"NOT_REVIEWED",hasHttpEvidence:false,
  factsVerified:false,publicationEligible:false,claimMentions:null,
 }]}]} as unknown as SEOControlReport;
 assert.doesNotMatch(draw(unsafe),/href="https:\/\/external\.example/);
});
test("product console includes the protected read-only project facts tab",()=>{
 const code=readFileSync(new URL("./visibility-product-console.tsx",import.meta.url),"utf8");
 assert.match(code,/id:"projects",label:"Prosjektfakta"/);
 assert.match(code,/tab==="projects"&&<VisibilityProjectReviewPanel/);
 assert.match(code,/tab!=="projects"&&<Empty/);
 assert.match(code,/tab==="projects"\)&&<>/);
});

test("tracked candidate URLs cannot create clickable property links",()=>{
 const tracked={...report,sites:[{brandId:"zeneco",projectReviewCandidates:[{
  url:"https://www.zenecohomes.com/eiendommer/example?redirect=somewhere",
  status:"NOT_REVIEWED",hasHttpEvidence:true,
  factsVerified:false,publicationEligible:false,claimMentions:null,
 }]}]} as unknown as SEOControlReport;
 assert.doesNotMatch(draw(tracked),/href="https:\/\/www\.zenecohomes\.com\/eiendommer\/example\?/);
});
