"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CornerDownLeft, Search, X } from "lucide-react";
import { filterNexusCommands } from "@/lib/nexus-command";

export function UniversalNexusCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useMemo(() => filterNexusCommands(query), [query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  function navigate(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 top-3 z-[85] hidden items-center gap-2 rounded-full border border-cyan-500/30 bg-slate-950/85 px-3 py-2 text-xs font-medium text-cyan-100 shadow-lg backdrop-blur hover:border-cyan-400/60 hover:bg-slate-900 lg:flex"
        aria-label="Søk i RealtyFlow"
      >
        <Command size={14} /> Søk <span className="text-slate-500">⌘K</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div className="mx-auto mt-[8vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
              <Search size={18} className="text-cyan-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && commands.length === 1 && query.trim()) {
                    event.preventDefault();
                    navigate(commands[0].href);
                  }
                }}
                placeholder="Finn CRM, kunder, pipeline, markedsføring eller en annen modul …"
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-500"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"><X size={17} /></button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto p-3">
              {commands.length > 0 ? (
                <div className="space-y-1">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gå til</p>
                  {commands.map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => navigate(command.href)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-slate-800/80"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-100">{command.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{command.description}</p>
                      </div>
                      <CornerDownLeft size={14} className="shrink-0 text-slate-600" />
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                  Ingen modul matcher søket. Bruk <strong className="text-cyan-200">Nexus AI</strong>-chatten for spørsmål, analyse og rådgivning.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-3 text-xs text-slate-500">
                  Hurtigtast: <strong className="text-slate-300">⌘K / Ctrl+K</strong>. Dette vinduet er kun for navigasjon. Spørsmål og rådgivning går gjennom én samtale: Nexus AI.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
