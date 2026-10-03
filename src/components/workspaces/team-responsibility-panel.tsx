"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, UsersRound } from "lucide-react";
import {
  buildWorkspaceTeamResponsibilityOverview,
  summarizeWorkspaceTeamResponsibilityOverview,
  type WorkspaceTeamBrand,
  type WorkspaceTeamUser,
  type WorkspaceResponsibilityCoverageStatus,
} from "@/lib/workspaces/team-responsibility-overview";

const statusMeta: Record<WorkspaceResponsibilityCoverageStatus, {
  label: string;
  className: string;
}> = {
  owned: {
    label: "Én ansvarlig",
    className: "border-emerald-800 bg-emerald-950/25 text-emerald-300",
  },
  shared: {
    label: "Delt ansvar",
    className: "border-amber-800 bg-amber-950/25 text-amber-300",
  },
  unassigned: {
    label: "Mangler ansvarlig",
    className: "border-rose-800 bg-rose-950/25 text-rose-300",
  },
  "no-capability": {
    label: "Ingen med tilgang",
    className: "border-slate-700 bg-slate-950/50 text-slate-400",
  },
};

export function WorkspaceTeamResponsibilityPanel({
  brands,
  users,
  onSelectUser,
}: {
  brands: WorkspaceTeamBrand[];
  users: WorkspaceTeamUser[];
  onSelectUser: (userId: string) => void;
}) {
  const overview = useMemo(
    () => buildWorkspaceTeamResponsibilityOverview({ brands, users }),
    [brands, users],
  );
  const summary = useMemo(
    () => summarizeWorkspaceTeamResponsibilityOverview(overview),
    [overview],
  );
  const [selectedBrandKey, setSelectedBrandKey] = useState<string>("all");

  const visible = selectedBrandKey === "all"
    ? overview
    : overview.filter(brand => brand.brandKey === selectedBrandKey);

  return <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Team · ansvarskart</p>
        <h2 className="mt-1 text-xl font-semibold">Hvem eier hva?</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Ansvar er et prioriteringslag, ikke tilgang. RealtyFlow viser hvor teamet har én tydelig eier,
          hvor ansvar er delt, og hvor et arbeidsområde mangler ansvarlig eller nødvendig modulrettighet.
        </p>
      </div>
      <select
        value={selectedBrandKey}
        onChange={event => setSelectedBrandKey(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
      >
        <option value="all">Alle merkevarer</option>
        {brands.map(brand => <option key={brand.brandKey} value={brand.brandKey}>{brand.name}</option>)}
      </select>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Aktive team-brands</span>
        <strong className="mt-1 block text-xl text-slate-100">{summary.activeBrands}</strong>
      </div>
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/15 p-3">
        <span className="text-[11px] uppercase tracking-wide text-emerald-500">Tydelig eier</span>
        <strong className="mt-1 block text-xl text-emerald-200">{summary.owned}</strong>
      </div>
      <div className="rounded-xl border border-amber-900/60 bg-amber-950/15 p-3">
        <span className="text-[11px] uppercase tracking-wide text-amber-500">Delt ansvar</span>
        <strong className="mt-1 block text-xl text-amber-200">{summary.shared}</strong>
      </div>
      <div className="rounded-xl border border-rose-900/60 bg-rose-950/15 p-3">
        <span className="text-[11px] uppercase tracking-wide text-rose-500">Mangler ansvarlig</span>
        <strong className="mt-1 block text-xl text-rose-200">{summary.unassigned}</strong>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Ingen med tilgang</span>
        <strong className="mt-1 block text-xl text-slate-300">{summary.noCapability}</strong>
      </div>
    </div>

    {(summary.unassigned > 0 || summary.shared > 0) && <div className="mt-4 flex gap-3 rounded-xl border border-amber-900/60 bg-amber-950/15 p-4 text-sm text-amber-100">
      <AlertTriangle size={18} className="mt-0.5 shrink-0"/>
      <p>
        <strong>Kontroller ansvarsfordelingen.</strong> «Mangler ansvarlig» betyr at noen allerede har
        nødvendig tilgang, men ingen er satt som eier. «Delt ansvar» kan være riktig, men bør være bevisst
        slik at oppfølging ikke faller mellom to personer.
      </p>
    </div>}

    <div className="mt-5 space-y-4">
      {visible.map(brand => <article key={brand.brandKey} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-100">{brand.brandName}</h3>
            <p className="mt-1 text-xs text-slate-500">{brand.activeMemberCount} aktive workspace-brukere</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
            {brand.unassignedCount > 0 && <span className="rounded-full border border-rose-800 px-2 py-1 text-rose-300">{brand.unassignedCount} uten eier</span>}
            {brand.sharedCount > 0 && <span className="rounded-full border border-amber-800 px-2 py-1 text-amber-300">{brand.sharedCount} delt</span>}
            {brand.unassignedCount === 0 && brand.sharedCount === 0 && brand.activeMemberCount > 0 &&
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 px-2 py-1 text-emerald-300"><CheckCircle2 size={11}/> ryddig</span>}
          </div>
        </div>

        {brand.activeMemberCount === 0
          ? <div className="mt-4 flex gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-400">
              <UsersRound size={17} className="mt-0.5 shrink-0"/>
              Ingen aktive workspace-brukere er knyttet til denne merkevaren ennå.
            </div>
          : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {brand.coverage.map(item => {
                const meta = statusMeta[item.status];
                return <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-sm text-slate-200">{item.label}</strong>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.description}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>

                  {item.owners.length > 0 && <div className="mt-3 flex flex-wrap gap-2">
                    {item.owners.map(owner => <button
                      key={owner.userId}
                      type="button"
                      onClick={() => onSelectUser(owner.userId)}
                      className="rounded-full border border-cyan-900 bg-cyan-950/30 px-2.5 py-1 text-[11px] text-cyan-200 hover:border-cyan-600"
                      title="Åpne bruker og juster ansvar"
                    >
                      {owner.displayName}{owner.accountKind === "external" ? " · ekstern" : ""}
                    </button>)}
                  </div>}

                  {item.status === "unassigned" && <div className="mt-3">
                    <p className="text-[11px] text-rose-300">Disse kan gjøre jobben, men ingen er satt som ansvarlig:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.eligibleUsers.map(user => <button
                        key={user.userId}
                        type="button"
                        onClick={() => onSelectUser(user.userId)}
                        className="rounded-full border border-rose-900/70 px-2.5 py-1 text-[11px] text-rose-200 hover:border-rose-600"
                      >
                        {user.displayName}
                      </button>)}
                    </div>
                  </div>}

                  {item.status === "no-capability" && <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0"/>
                    Ingen aktiv bruker har den modulrettigheten som kreves for å eie dette området.
                  </p>}
                </div>;
              })}
            </div>}
      </article>)}
    </div>
  </section>;
}
