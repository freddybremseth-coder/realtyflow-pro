import type { PromotionBrand, PromotionItem, PromotionSelection } from "./remaster-mix-promotions";

export type SelectionIssueReason =
  | "not_published_or_preview" | "style_mismatch" | "collection_mismatch"
  | "series_mismatch" | "language_mismatch";
export interface SelectionIssue {
  id: string;
  title: string;
  reason: SelectionIssueReason;
  actualValue?: string;
  selectedValues?: string[];
  detailUrl?: string;
  imageUrl?: string;
}

/** Validate ALL explicit IDs (not a sampled/repeated 180-image playlist).
 * Catalog contains approved public items only. Never silently widen a user's
 * style/collection/series filters or replace a specifically requested work.
 */
export function diagnoseExplicitMixSelection(
  catalog: PromotionItem[], selection: PromotionSelection,
): SelectionIssue[] {
  if(selection.brand!=="art"&&selection.brand!=="books")return [];
  const brand: "art"|"books"=selection.brand;
  const ids=brand==="art" ? selection.artIds||[] : selection.bookIds||[];
  const byId=new Map(catalog.map(item=>[item.id.toLowerCase(),item]));
  const issues: SelectionIssue[]=[];
  const normalized=(items?:string[])=>new Set((items||[]).map(value=>value.toLowerCase()));
  const style=normalized(selection.artStyles),collection=normalized(selection.artCollections);
  const series=normalized(selection.bookSeries),language=normalized(selection.bookLanguages);
  for(const id of [...new Set(ids)]){
    const item=byId.get(id.toLowerCase());
    if(!item){
      issues.push({id,title:id,reason:"not_published_or_preview"});
      continue;
    }
    const common={id,title:item.title,detailUrl:item.detailUrl,imageUrl:item.imageUrl};
    if(brand==="art"&&style.size&&!style.has((item.style||"").toLowerCase())){
      issues.push({...common,reason:"style_mismatch",actualValue:item.style||"",selectedValues:selection.artStyles||[]});
    }else if(brand==="art"&&collection.size&&!collection.has((item.collection||"").toLowerCase())){
      issues.push({...common,reason:"collection_mismatch",actualValue:item.collection||"",selectedValues:selection.artCollections||[]});
    }else if(brand==="books"&&series.size&&!series.has((item.series||"").toLowerCase())){
      issues.push({...common,reason:"series_mismatch",actualValue:item.series||"",selectedValues:selection.bookSeries||[]});
    }else if(brand==="books"&&language.size&&!language.has((item.language||"").toLowerCase())){
      issues.push({...common,reason:"language_mismatch",actualValue:item.language||"",selectedValues:selection.bookLanguages||[]});
    }
  }
  return issues;
}
export function describeMixSelectionIssue(issue:SelectionIssue) {
  const why=issue.reason==="style_mismatch"
    ? "kunststilen er "+(issue.actualValue||"ukjent")+", som ikke er blant valgte stiler ("+(issue.selectedValues||[]).join(", ")+")"
    : issue.reason==="collection_mismatch" ? "kolleksjonen er "+(issue.actualValue||"ukjent")+", utenfor valgte kolleksjoner"
    : issue.reason==="series_mismatch" ? "bokserien er "+(issue.actualValue||"ukjent")+", utenfor valgte serier"
    : issue.reason==="language_mismatch" ? "språket er "+(issue.actualValue||"ukjent")+", utenfor valgte språk"
    : "verket er ikke tilgjengelig i den godkjente publiserte katalogen, eller mangler offentlig forhåndsvisning";
  return issue.title+" ["+issue.id+"]: "+why+".";
}
export class MixSelectionValidationError extends Error {
  readonly code="MIX_PROMOTION_SELECTION_INVALID";
  constructor(readonly issues:SelectionIssue[]){
    super("Bildene i miksen passer ikke til de valgte filtrene: "+issues.map(describeMixSelectionIssue).join(" "));
    this.name="MixSelectionValidationError";
  }
}
