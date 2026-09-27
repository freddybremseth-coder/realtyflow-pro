"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronLeft, Clock, Target } from "lucide-react";
import type { WorkspacePermission } from "@/lib/workspaces/brand-policy";
import { trainingArticlesFor, type TrainingArticle } from "@/lib/workspaces/training-content";

function storageKey(brandKey: string) {
  return `realtyflow-workspace-training:${brandKey}`;
}

export function WorkspaceTrainingPanel({
  brandKey,
  permissions,
}: {
  brandKey: string;
  permissions: WorkspacePermission[];
}) {
  const articles = useMemo(
    () => trainingArticlesFor({ brandKey, permissions }),
    [brandKey, permissions],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(brandKey)) || "[]");
      setReadIds(Array.isArray(parsed) ? parsed.filter(value => typeof value === "string") : []);
    } catch {
      setReadIds([]);
    }
  }, [brandKey]);

  function markRead(id: string) {
    setReadIds(current => {
      const next = Array.from(new Set([...current, id]));
      try { localStorage.setItem(storageKey(brandKey), JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const selected = articles.find(article => article.id === selectedId) || null;
  const progress = articles.length
    ? Math.round((articles.filter(article => readIds.includes(article.id)).length / articles.length) * 100)
    : 0;

  if (selected) {
    return <TrainingArticleView
      article={selected}
      isRead={readIds.includes(selected.id)}
      onBack={() => setSelectedId(null)}
      onMarkRead={() => markRead(selected.id)}
    />;
  }

  return <section className="space-y-4">
    <div className="rounded-2xl border border-cyan-900/60 bg-cyan-950/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Opplæring</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold"><BookOpen size={21}/> Slik jobber vi</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Korte, praktiske guider om hva vi prøver å oppnå, hvordan verktøyene brukes og hvordan arbeidet ditt blir til leads, møter og salg.
          </p>
        </div>
        <div className="min-w-28 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
          <div className="text-2xl font-bold text-cyan-300">{progress}%</div>
          <div className="text-[11px] text-slate-500">lest</div>
        </div>
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      {articles.map(article => {
        const isRead = readIds.includes(article.id);
        return <button
          key={article.id}
          type="button"
          onClick={() => setSelectedId(article.id)}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left hover:border-cyan-600"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{article.shortTitle}</h3>
              <p className="mt-2 text-sm text-slate-400">{article.summary}</p>
            </div>
            {isRead && <CheckCircle2 size={19} className="shrink-0 text-emerald-400"/>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Clock size={13}/>{article.readMinutes} min
          </div>
        </button>;
      })}
    </div>
  </section>;
}

function TrainingArticleView({
  article,
  isRead,
  onBack,
  onMarkRead,
}: {
  article: TrainingArticle;
  isRead: boolean;
  onBack: () => void;
  onMarkRead: () => void;
}) {
  return <article className="space-y-5">
    <button type="button" onClick={onBack}
      className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">
      <ChevronLeft size={16}/> Tilbake til opplæring
    </button>

    <header className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Slik jobber vi</p>
      <h2 className="mt-2 text-2xl font-bold">{article.title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{article.summary}</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Clock size={13}/>{article.readMinutes} min lesetid</div>
    </header>

    {article.sections.map((section, index) => <section key={index}
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="text-lg font-semibold">{section.heading}</h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
        {(section.paragraphs || []).map((paragraph, pIndex) => <p key={pIndex}>{paragraph}</p>)}
        {section.bullets?.length ? <ul className="space-y-2 pl-5">
          {section.bullets.map((bullet, bIndex) => <li key={bIndex} className="list-disc pl-1">{bullet}</li>)}
        </ul> : null}
        {section.emphasis && <div className="mt-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-4">
          <p className="flex gap-2 text-cyan-100"><Target size={17} className="mt-1 shrink-0"/><span>{section.emphasis}</span></p>
        </div>}
      </div>
    </section>)}

    <div className="flex justify-end">
      <button type="button" onClick={onMarkRead} disabled={isRead}
        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-emerald-900 disabled:text-emerald-200">
        <CheckCircle2 size={16}/>{isRead ? "Markert som lest" : "Marker som lest"}
      </button>
    </div>
  </article>;
}
