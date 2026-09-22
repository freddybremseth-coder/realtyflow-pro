import assert from "node:assert/strict";
import test from "node:test";
import {diagnoseExplicitMixSelection,MixSelectionValidationError} from "./remaster-mix-selection-validation";
import {selectApprovedPromotionItems,type PromotionItem} from "./remaster-mix-promotions";

const art:PromotionItem[]=[
  {id:"kongelig-gatekunst-hap-smerte-og-kjrlighet",
    title:"Royal Street Art: Hope, Pain and Love",style:"symbolic-street-art",
    collection:"symbolic-street-art",imageUrl:"https://example.com/royal.webp",
    detailUrl:"https://art.freddybremseth.com/verk/kongelig-gatekunst-hap-smerte-og-kjrlighet/"},
  {id:"quiet-figure",title:"Quiet Figure",style:"symbolic-realism",collection:"human-condition",
    imageUrl:"https://example.com/quiet.webp",detailUrl:"https://art.freddybremseth.com/verk/quiet-figure/"},
];
test("names exactly the published 12%-failure artwork and actual symbolic-street-art, not nonexistent/unpublished",()=>{
  const selection={brand:"art" as const,randomSeed:"day",artStyles:["street-art","symbolic-realism"],
    artIds:art.map(x=>x.id)};
  const issues=diagnoseExplicitMixSelection(art,selection);
  assert.equal(issues.length,1);
  assert.deepEqual(issues[0],{
    id:"kongelig-gatekunst-hap-smerte-og-kjrlighet",title:"Royal Street Art: Hope, Pain and Love",
    reason:"style_mismatch",actualValue:"symbolic-street-art",
    selectedValues:["street-art","symbolic-realism"],
    detailUrl:art[0].detailUrl,imageUrl:art[0].imageUrl,
  });
  assert.match(new MixSelectionValidationError(issues).message,/Royal Street Art: Hope, Pain and Love.*symbolic-street-art/);
  assert.deepEqual(diagnoseExplicitMixSelection(art,{...selection,artStyles:[...selection.artStyles,"symbolic-street-art"]}),[]);
  assert.deepEqual(diagnoseExplicitMixSelection(art,{...selection,artIds:["quiet-figure"]}),[]);
});
test("reports missing/unpublished or no-preview selected ID distinctly without fabricating title",()=>{
  const issues=diagnoseExplicitMixSelection(art,{brand:"art",randomSeed:"day",artIds:["removed-id"]});
  assert.deepEqual(issues,[{id:"removed-id",title:"removed-id",reason:"not_published_or_preview"}]);
});
test("validates explicit IDs directly, not against a random 180-image sample",()=>{
  const many=Array.from({length:181},(_,i)=>({
    id:"work-"+i,title:"Work "+i,style:"abstract",collection:"abstract",
    imageUrl:"https://example.com/"+i+".webp",detailUrl:"https://art.freddybremseth.com/verk/work-"+i+"/",
  }));
  const selection={brand:"art" as const,randomSeed:"seed",artStyles:["abstract"],artIds:many.map(x=>x.id)};
  const limited=new Set(selectApprovedPromotionItems(many,selection,180).map(x=>x.id));
  assert.ok(many.some(item=>!limited.has(item.id)),"some explicitly selected IDs need not appear in a random 180-preview sample");
  assert.deepEqual(diagnoseExplicitMixSelection(many,selection),[]);
});
test("book selection returns exact name and series/language mismatch",()=>{
  const catalog:PromotionItem[]=[{id:"b1",title:"The Facade of Justice",series:"michael-thorne",language:"en",imageUrl:"https://example.com/book.png",detailUrl:"https://books.freddybremseth.com/book/the-facade-of-justice"}];
  assert.equal(diagnoseExplicitMixSelection(catalog,{brand:"books",randomSeed:"one",bookIds:["b1"],bookSeries:["victoria-andreas"]})[0].reason,"series_mismatch");
  assert.equal(diagnoseExplicitMixSelection(catalog,{brand:"books",randomSeed:"one",bookIds:["b1"],bookLanguages:["no"]})[0].reason,"language_mismatch");
});
