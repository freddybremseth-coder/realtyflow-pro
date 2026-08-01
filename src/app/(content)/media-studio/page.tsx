import Link from "next/link";
import { Mic2, Sparkles } from "lucide-react";
import { MediaStudioClient } from "@/components/media-studio/media-studio-client";

export default function MediaStudioPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-primary-500/25 bg-gradient-to-r from-primary-500/10 via-slate-900/80 to-fuchsia-500/10 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-200"><Sparkles size={16} />Ny Voice Studio Pro</div>
          <h2 className="mt-1 text-lg font-semibold text-white">AI-manus, uttale, pauser, undertekster og profesjonell voice-over</h2>
          <p className="mt-1 text-sm text-slate-400">Et eget arbeidsrom for flerspråklig lydproduksjon, voice-jobber og Media Library.</p>
        </div>
        <Link href="/media-studio/voice" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white transition hover:bg-primary-400">
          <Mic2 size={16} /> Åpne Voice Studio Pro
        </Link>
      </div>
      <MediaStudioClient />
    </div>
  );
}
