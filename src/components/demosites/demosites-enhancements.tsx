"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react";

type LocalTemplate = {
  slug: string;
  name: string;
  category: string;
  description: string;
};

type DemoOrder = {
  id: string;
  company_name?: string;
  preview_url?: string | null;
  production_url?: string | null;
  claim_url?: string | null;
  claim_token?: string | null;
};

function previewUrlFor(order: DemoOrder) {
  if (order.claim_token) return `/demosites/preview/${encodeURIComponent(order.claim_token)}`;
  if (order.claim_url?.includes("/demosites/claim/")) {
    try {
      const url = new URL(order.claim_url, window.location.origin);
      return `${url.pathname.replace("/demosites/claim/", "/demosites/preview/")}${url.search}`;
    } catch {
      return order.claim_url.replace("/demosites/claim/", "/demosites/preview/");
    }
  }
  if (order.preview_url?.includes("/demosites/preview/")) {
    try {
      const url = new URL(order.preview_url, window.location.origin);
      return `${url.pathname}${url.search}`;
    } catch {
      return order.preview_url;
    }
  }
  return "";
}

function normalizeHref(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function isPreviewAnchor(anchor: HTMLAnchorElement) {
  const text = (anchor.textContent || "").toLowerCase();
  return text.includes("preview") || text.includes("prøveside") || text.includes("kundevisning");
}

function setAnchorHrefIfChanged(anchor: HTMLAnchorElement, nextHref: string, guard: string) {
  const current = normalizeHref(anchor.getAttribute("href"));
  const next = normalizeHref(nextHref);
  if (!next || current === next) return false;
  anchor.setAttribute("href", nextHref);
  anchor.dataset.previewGuard = guard;
  return true;
}

function repairPreviewAnchors(orders: DemoOrder[]) {
  const replacements = new Map<string, string>();
  for (const order of orders) {
    const correct = previewUrlFor(order);
    if (!correct) continue;
    for (const oldValue of [order.preview_url, order.production_url]) {
      const normalized = normalizeHref(oldValue);
      if (normalized) replacements.set(normalized, correct);
    }
  }

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    if (!isPreviewAnchor(anchor)) return;
    const current = normalizeHref(anchor.getAttribute("href"));
    const direct = replacements.get(current);
    if (direct) {
      setAnchorHrefIfChanged(anchor, direct, "corrected");
      return;
    }

    // Older orders can have a production URL stored as preview_url. The claim
    // link in the same order card is still authoritative and contains the token.
    const container = anchor.closest("[class*='rounded-xl'], [class*='rounded-lg'], article, section, div");
    const claim = container?.querySelector<HTMLAnchorElement>('a[href*="/demosites/claim/"]');
    if (claim) {
      const corrected = claim.href.replace("/demosites/claim/", "/demosites/preview/");
      setAnchorHrefIfChanged(anchor, corrected, "claim-derived");
    }
  });
}

function usePreviewLinkGuard() {
  useEffect(() => {
    let active = true;
    let orders: DemoOrder[] = [];
    let observer: MutationObserver | null = null;
    let repairScheduled = false;

    function scheduleRepair() {
      if (repairScheduled || !active) return;
      repairScheduled = true;
      window.requestAnimationFrame(() => {
        repairScheduled = false;
        if (active) repairPreviewAnchors(orders);
      });
    }

    async function loadAndRepair() {
      try {
        const response = await fetch("/api/saas/demosites", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!active || !response.ok) return;
        orders = Array.isArray(data.orders) ? data.orders : [];
        repairPreviewAnchors(orders);
        observer = new MutationObserver(scheduleRepair);
        // Observe React adding/removing content only. Watching href attributes
        // caused the guard to react to its own corrections and could lock the UI.
        observer.observe(document.body, { childList: true, subtree: true });
      } catch {
        // Link guard is best effort; the server-side preview remains available.
      }
    }

    function capturePreviewClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || !isPreviewAnchor(target)) return;
      repairPreviewAnchors(orders);
      const href = target.getAttribute("href") || "";
      if (/\/sites\/|\/saas(?:\/|\?|$)/.test(href)) {
        const container = target.closest("[class*='rounded-xl'], [class*='rounded-lg'], article, section, div");
        const claim = container?.querySelector<HTMLAnchorElement>('a[href*="/demosites/claim/"]');
        if (claim) {
          event.preventDefault();
          window.open(claim.href.replace("/demosites/claim/", "/demosites/preview/"), target.target || "_blank");
        }
      }
    }

    document.addEventListener("click", capturePreviewClick, true);
    void loadAndRepair();
    return () => {
      active = false;
      observer?.disconnect();
      document.removeEventListener("click", capturePreviewClick, true);
    };
  }, []);
}

export function DemoSitesEnhancements() {
  const pathname = usePathname();
  const [templates, setTemplates] = useState<LocalTemplate[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePreviewLinkGuard();

  const orderId = useMemo(() => {
    const match = pathname.match(/\/demosites\/setup\/([^/?#]+)/);
    return match?.[1] || "";
  }, [pathname]);
  const selectedTemplate = templates.find((item) => item.slug === selected);

  useEffect(() => {
    let active = true;
    fetch("/api/saas/demosites/local-templates", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunne ikke hente bransjemaler.");
        if (!active) return;
        const rows = Array.isArray(data.templates) ? data.templates : [];
        setTemplates(rows);
        setSelected((current) => current || rows[0]?.slug || "");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Kunne ikke hente bransjemaler.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function applyTemplate() {
    if (!orderId || !selected) return;
    setApplying(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites/local-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, template_slug: selected, replace_content: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke bruke bransjemalen.");
      setMessage(`${data.template?.name || "Bransjemalen"} er lagt inn. Logo, bilder og kontaktinformasjon er beholdt.`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke bruke bransjemalen.");
    } finally {
      setApplying(false);
    }
  }

  if (!pathname.startsWith("/demosites")) return null;

  if (orderId) {
    return (
      <section className="mb-6 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-slate-900/80 to-cyan-500/10 p-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-200"><Sparkles className="h-4 w-4" /> Lokale bransjemaler 2026</div>
            <h2 className="mt-2 text-xl font-bold">Velg et mer presist utgangspunkt for kunden</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Malen oppdaterer tjenester, CTA, trygghetspunkter, FAQ og struktur. Kundens logo, bilder og kontaktinformasjon beholdes.</p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:max-w-xl">
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={loading || applying}
              className="h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-violet-400"
            >
              {loading && <option>Laster bransjemaler …</option>}
              {templates.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
            <button
              type="button"
              onClick={applyTemplate}
              disabled={!selected || applying || loading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-violet-500 px-5 text-sm font-bold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Bruk mal
            </button>
          </div>
        </div>
        {selectedTemplate && <p className="mt-3 text-xs leading-5 text-slate-400"><strong className="text-slate-200">{selectedTemplate.name}:</strong> {selectedTemplate.description}</p>}
        {message && <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}
        {error && <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}
      </section>
    );
  }

  if (pathname === "/demosites" || pathname === "/demosites/") {
    return (
      <section className="mb-6 rounded-2xl border border-cyan-500/20 bg-slate-900/70 p-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><BriefcaseBusiness className="h-4 w-4" /> Utvidet bransjebibliotek</div>
            <h2 className="mt-2 text-xl font-bold">{loading ? "Laster lokale bransjemaler …" : `${templates.length} presise maler for lokale bedrifter`}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Rådgiver, tannlege, terapeut, bilverksted, håndverker, tak og fasade, regnskapsfører, fotograf, veterinær, hage/anlegg, interiør og trening – i tillegg til eksisterende maler.</p>
          </div>
          <a href="#nye-bransjemaler" className="inline-flex items-center justify-center rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/10">
            Se malene <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </div>
        {!loading && templates.length > 0 && (
          <div id="nye-bransjemaler" className="mt-4 flex flex-wrap gap-2">
            {templates.map((item) => <span key={item.slug} className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300">{item.name}</span>)}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-amber-200">{error}</div>}
      </section>
    );
  }

  return null;
}
