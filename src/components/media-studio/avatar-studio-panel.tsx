"use client";

import { Film, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AvatarStudioPanelProps {
  avatarAvailable: boolean;
  imageToVideoAvailable: boolean;
  onStartPortraitMotion: () => void;
}

export function AvatarStudioPanel({
  avatarAvailable,
  imageToVideoAvailable,
  onStartPortraitMotion,
}: AvatarStudioPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserRound size={18} className="text-primary-400" />Avatar Studio</CardTitle>
        <CardDescription>
          Lag avatar- og portrettinnhold med tydelig skille mellom enkel bildeanimasjon og en faktisk talking-avatar/lip-sync-provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {avatarAvailable ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            En tilkoblet provider rapporterer avatar-capability. Bruk Create, last opp et godkjent referansebilde og velg Avatar.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <p className="font-medium text-slate-200">Talking avatar er ikke tilgjengelig ennå</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              OpenArt MCP rapporterer ikke en offisiell talking-avatar/lip-sync-capability akkurat nå. RealtyFlow later derfor ikke som vanlig image-to-video er det samme som en snakkende avatar.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-primary-500/25 bg-primary-500/5 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 font-medium text-slate-100"><Film size={17} className="text-primary-300" />Animer et portrett eller profilbilde</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                Bruk OpenArt image-to-video for naturlig blunking, diskret hodebevegelse, rolig kamerabevegelse eller en profesjonell LinkedIn-animasjon. Dette er bildeanimasjon, ikke lip-sync.
              </p>
            </div>
            <Button type="button" onClick={onStartPortraitMotion} disabled={!imageToVideoAvailable} className="shrink-0 gap-2">
              <Film size={15} /> Last opp og animer bilde
            </Button>
          </div>
          {!imageToVideoAvailable && <p className="mt-3 text-xs text-amber-300">Ingen provider rapporterer image-to-video capability akkurat nå.</p>}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3 text-xs leading-5 text-sky-100">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          Bruk bare personbilder du har rettighet og nødvendig samtykke til å animere. Resultatet skal merkes som AI-generert når det kan forveksles med ekte opptak.
        </div>
      </CardContent>
    </Card>
  );
}
