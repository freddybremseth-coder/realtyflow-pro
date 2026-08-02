import { readFile, writeFile } from "node:fs/promises";

const path = "src/components/media-studio/media-studio-client.tsx";
let source = await readFile(path, "utf8");

function replaceOnce(label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "component imports",
  'import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";',
  'import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";\nimport { ReferenceMediaPicker } from "@/components/media-studio/reference-media-picker";\nimport { MediaProjectsPanel } from "@/components/media-studio/media-projects-panel";\nimport { AvatarStudioPanel } from "@/components/media-studio/avatar-studio-panel";',
);

replaceOnce(
  "reference media picker",
  '                <textarea value={requestText} onChange={(event) => { setRequestText(event.target.value); setPlan(null); }} rows={7} className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-400" />\n                {mode !== "simple" && (',
  '                <textarea value={requestText} onChange={(event) => { setRequestText(event.target.value); setPlan(null); }} rows={7} className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-slate-100 outline-none focus:border-primary-400" />\n                <ReferenceMediaPicker\n                  value={sourceImageUrl}\n                  onChange={(url) => { setSourceImageUrl(url); setPlan(null); }}\n                  brandId={brandId}\n                  title="Bilde eller referanse som AI skal bruke"\n                  description="Påkrevd for «Animer bilde», image-to-video, portrettmaler, produktbilder og andre jobber som skal bevare et eksisterende motiv."\n                />\n                {mode !== "simple" && (',
);

replaceOnce(
  "avatar studio",
  `        <TabsContent value="avatar">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound size={18} className="text-primary-400" />Avatar Studio</CardTitle><CardDescription>Arkitekturen er klar, men en faktisk avatar-provider må rapportere capability før generering aktiveres.</CardDescription></CardHeader>
            <CardContent>
              {avatarAvailable
                ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">Avatar-capability er tilgjengelig. Bruk Create for provider-styrt generering.</div>
                : <CapabilityNotice title="Ingen avatar-provider tilkoblet" text="OpenArt MCP rapporterer ikke avatar/talking-avatar nå. Modulen aktiveres først når en offisiell provider med samtykke, referansebilder og asynkrone jobber er koblet til." />}
            </CardContent>
          </Card>
        </TabsContent>`,
  `        <TabsContent value="avatar">
          <AvatarStudioPanel
            avatarAvailable={avatarAvailable}
            imageToVideoAvailable={Boolean(openArt?.video?.imageToVideo)}
            onStartPortraitMotion={() => {
              setMediaType("video");
              setRequestText("Animer dette portrettet med naturlig blunking, diskret hodebevegelse og rolig profesjonell kamerabevegelse. Bevar personens identitet og ansiktstrekk. Ingen tale eller lip-sync.");
              setAspectRatio("4:5");
              setQualityTier("premium");
              setSourceImageUrl("");
              setPlan(null);
              setView("create");
            }}
          />
        </TabsContent>`,
);

replaceOnce(
  "projects panel",
  `        <TabsContent value="projects">
          <Card>
            <CardHeader><CardTitle>Projects</CardTitle><CardDescription>Prosjekter opprettes automatisk for genereringer og kan senere organiseres manuelt.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => <div key={project.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-slate-100">{project.name}</h3><p className="text-xs text-slate-500">{project.project_type || "general"} · {brandName(project.brand_id)}</p>{project.description && <p className="mt-2 line-clamp-2 text-xs text-slate-400">{project.description}</p>}</div><Badge variant={statusVariant(project.status)}>{project.status}</Badge></div></div>)}
              {projects.length === 0 && <p className="text-sm text-slate-500">Ingen prosjekter ennå.</p>}
            </CardContent>
          </Card>
        </TabsContent>`,
  `        <TabsContent value="projects">
          <MediaProjectsPanel />
        </TabsContent>`,
);

await writeFile(path, source);
console.log(`Patched ${path}`);
