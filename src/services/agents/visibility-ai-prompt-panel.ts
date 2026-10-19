/** Fixed prompts for repeatable Altovena AI Visibility sampling.
 * These are test scenarios, not evidence that any provider has been queried.
 */
export const ZENECO_AI_PROMPT_PANEL = [
 {id:"nb-buy-albir",locale:"nb-NO",intent:"buyer-guide",prompt:"Hva bør jeg vite før jeg kjøper bolig i Albir i Spania?"},
 {id:"nb-finestrat",locale:"nb-NO",intent:"area-selection",prompt:"Hva er fordelene og ulempene ved å kjøpe bolig i Finestrat?"},
 {id:"nb-villajoyosa",locale:"nb-NO",intent:"area-selection",prompt:"Hvilke områder i Villajoyosa passer for helårsbolig?"},
 {id:"nb-costs",locale:"nb-NO",intent:"buyer-costs",prompt:"Hvilke omkostninger kommer i tillegg når nordmenn kjøper bolig på Costa Blanca?"},
 {id:"nb-advisor",locale:"nb-NO",intent:"advisor",prompt:"Hvordan finner jeg en norsktalende kjøperrådgiver på Costa Blanca Nord?"},
 {id:"en-altea",locale:"en-GB",intent:"area-selection",prompt:"What should buyers consider when purchasing a home in Altea, Spain?"},
 {id:"en-benidorm",locale:"en-GB",intent:"buyer-guide",prompt:"Where can I find independent buyer guidance for Benidorm property?"},
 {id:"es-costa-blanca",locale:"es-ES",intent:"buyer-guide",prompt:"¿Qué debo revisar antes de comprar una vivienda en la Costa Blanca?"},
] as const;
export type ZenecoAiPromptId=typeof ZENECO_AI_PROMPT_PANEL[number]["id"];
export function findZenecoAiPrompt(id:string){return ZENECO_AI_PROMPT_PANEL.find(x=>x.id===id)??null;}
