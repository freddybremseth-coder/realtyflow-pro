/** Distinguish general-purpose model responses from actual search-result evidence. */
export type AiAcquisitionSource =
  | "nexus_text_generation" | "manual_report" | "provider_search_api";
export type AiAcquisitionDecision = {
  recordable: boolean;
  independentlyVerified: false;
  reason: string;
};
/**
 * A model answer is not ChatGPT Search, Gemini AI Overview, or Perplexity
 * search-result visibility. Provider-specific search evidence ingestion needs
 * a separate validated connector and attestable response provenance.
 */
export function assessAiAcquisition(source:AiAcquisitionSource, hasProviderProvenance:boolean):AiAcquisitionDecision {
 if(source==="nexus_text_generation")return {recordable:false,independentlyVerified:false,
  reason:"Nexus AI text generation does not prove public AI search visibility."};
 if(source==="provider_search_api"&&!hasProviderProvenance)return {recordable:false,independentlyVerified:false,
  reason:"Provider search response provenance is missing."};
 if(source==="provider_search_api")return {recordable:false,independentlyVerified:false,
  reason:"Search connector admission and provenance verification are not yet implemented."};
 return {recordable:true,independentlyVerified:false,
  reason:"Manual reports are accepted only as independently unverified observations."};
}
