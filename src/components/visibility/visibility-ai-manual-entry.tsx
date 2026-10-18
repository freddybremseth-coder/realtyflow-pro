"use client";
import { useState } from "react";

type Provider = "chatgpt" | "google_ai" | "perplexity" | "copilot";
const providerLabels:Record<Provider,string>={chatgpt:"ChatGPT Search",google_ai:"Google AI",perplexity:"Perplexity",copilot:"Microsoft Copilot"};
export function VisibilityAiManualEntry({onSaved}:{onSaved:()=>void}) {
 const [provider,setProvider]=useState<Provider>("chatgpt");
 const [prompt,setPrompt]=useState("");
 const [responseExcerpt,setResponseExcerpt]=useState("");
 const [urls,setUrls]=useState("");
 const [brandMentioned,setBrandMentioned]=useState(false);
 const [locale,setLocale]=useState("nb-NO");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(busy)return;setBusy(true);setMessage("");
  try {
   const citedUrls=urls.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   const res=await fetch("/api/visibility/ai-observations",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({brandId:"zeneco",provider,prompt,responseExcerpt,locale,citedUrls,brandMentioned,capturedBy:"manual",observedAt:new Date().toISOString()})});
   const result=await res.json() as {error?:string};
   if(!res.ok)throw new Error(result.error||"Kunne ikke lagre");
   setMessage("Manuell observasjon lagret som IKKE uavhengig verifisert.");setPrompt("");setResponseExcerpt("");setUrls("");setBrandMentioned(false);onSaved();
  }catch(e){setMessage(e instanceof Error?e.message:"Ukjent feil");}
  finally{setBusy(false);}
 };
 return <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
  <h4 className="font-bold text-slate-950">Registrer én manuell AI-observasjon</h4>
  <p className="mt-1 text-xs text-slate-600">Kun eier. Opplysningene er manuelt oppgitt; vi har ikke kontrollert dem mot AI-leverandøren. Tidspunkt registreres ved innsending.</p>
  <div className="mt-3 grid gap-3 sm:grid-cols-2">
   <label className="text-xs font-semibold text-slate-700">AI-tjeneste<select className="mt-1 block w-full rounded-lg border p-2 text-sm" value={provider} onChange={e=>setProvider(e.target.value as Provider)}>{Object.entries(providerLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className="text-xs font-semibold text-slate-700">Språk/region<input className="mt-1 block w-full rounded-lg border p-2 text-sm" required maxLength={40} value={locale} onChange={e=>setLocale(e.target.value)}/></label>
  </div>
  <label className="mt-3 block text-xs font-semibold text-slate-700">Eksakt søkespørsmål<input className="mt-1 block w-full rounded-lg border p-2 text-sm" required maxLength={2000} value={prompt} onChange={e=>setPrompt(e.target.value)}/></label>
  <label className="mt-3 block text-xs font-semibold text-slate-700">Utdrag av observert svar<textarea className="mt-1 block w-full rounded-lg border p-2 text-sm" rows={3} required maxLength={4000} value={responseExcerpt} onChange={e=>setResponseExcerpt(e.target.value)}/></label>
  <label className="mt-3 block text-xs font-semibold text-slate-700">Kildelenker i svaret, én https-URL per linje<textarea className="mt-1 block w-full rounded-lg border p-2 text-sm" rows={2} value={urls} onChange={e=>setUrls(e.target.value)}/></label>
  <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={brandMentioned} onChange={e=>setBrandMentioned(e.target.checked)}/>Zen Eco Homes ble nevnt ved navn</label>
  <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-teal-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?"Lagrer …":"Lagre som ikke verifisert"}</button>
  {message&&<p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
 </form>;
}
