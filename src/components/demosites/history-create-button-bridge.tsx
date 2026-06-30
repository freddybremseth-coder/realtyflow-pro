"use client";

import { useEffect } from "react";

const HISTORY_FILTERS_ID = "demosites-history-filters";

function normalizeButtonText(button: HTMLButtonElement) {
  return (button.textContent || "").replace(/\s+/g, " ").trim();
}

function isInDemoSitesImportHistory(button: HTMLButtonElement) {
  let element: HTMLElement | null = button.parentElement;
  while (element && element !== document.body) {
    const text = element.textContent || "";
    if (text.includes("Siste analyser") && text.includes("Tidligere nettsideanalyser")) return true;
    element = element.parentElement;
  }
  return false;
}

function findReviewCreateButton() {
  const buttons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.find((button) => normalizeButtonText(button) === "Opprett demo fra analyse" && !button.disabled) || null;
}

function findHistoryRoot() {
  const headings = Array.from(document.querySelectorAll("h3"));
  const heading = headings.find((item) => (item.textContent || "").trim() === "Siste analyser");
  return heading?.closest(".rounded-xl") as HTMLElement | null;
}

function getHistoryRows(root: HTMLElement) {
  return Array.from(root.querySelectorAll(".mt-4.space-y-3 > div")) as HTMLElement[];
}

function getStatus(row: HTMLElement) {
  const text = row.textContent || "";
  if (text.includes("Demo opprettet")) return "created_demo";
  if (text.includes("Brukt på demo")) return "applied_to_demo";
  if (text.includes("Forkastet")) return "discarded";
  return "analyzed";
}

function createHistoryFilters(root: HTMLElement) {
  if (root.querySelector(`#${HISTORY_FILTERS_ID}`)) return;

  const filters = document.createElement("div");
  filters.id = HISTORY_FILTERS_ID;
  filters.className = "mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3";
  filters.innerHTML = `
    <div class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto_180px_180px] lg:items-end">
      <label class="block">
        <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Søk</span>
        <input aria-label="Søk i analyser" placeholder="Skriv firmanavn, nettside eller bransje..." class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500" />
      </label>
      <button type="button" data-history-search="apply" class="h-9 rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white hover:bg-cyan-500">Søk</button>
      <button type="button" data-history-search="reset" class="h-9 rounded-lg border border-slate-700 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-800">Nullstill</button>
      <label class="block">
        <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Status</span>
        <select aria-label="Statusfilter" class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500">
          <option value="all">Alle statuser</option>
          <option value="analyzed">Analysert</option>
          <option value="created_demo">Demo opprettet</option>
          <option value="applied_to_demo">Brukt på demo</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vis</span>
        <select aria-label="Visningsfilter" class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500">
          <option value="active">Skjul brukte</option>
          <option value="all">Vis alle</option>
          <option value="used">Kun brukte</option>
        </select>
      </label>
    </div>
    <div data-history-filter-count class="mt-2 text-[11px] text-slate-500"></div>
  `;

  const list = root.querySelector(".mt-4.space-y-3");
  if (list) root.insertBefore(filters, list);

  const searchInput = filters.querySelector("input") as HTMLInputElement | null;
  const selects = Array.from(filters.querySelectorAll("select")) as HTMLSelectElement[];
  const [statusSelect, usageSelect] = selects;
  const applyButton = filters.querySelector('[data-history-search="apply"]') as HTMLButtonElement | null;
  const resetButton = filters.querySelector('[data-history-search="reset"]') as HTMLButtonElement | null;
  const countLabel = filters.querySelector("[data-history-filter-count]") as HTMLElement | null;

  if (!searchInput || !statusSelect || !usageSelect) return;

  const applyFilters = () => {
    const query = (searchInput.value || "").trim().toLowerCase();
    const status = statusSelect.value;
    const usage = usageSelect.value;
    let visibleCount = 0;

    getHistoryRows(root).forEach((row) => {
      const rowStatus = getStatus(row);
      const rowText = (row.textContent || "").toLowerCase();
      const used = rowStatus === "created_demo" || rowStatus === "applied_to_demo";
      const matchesQuery = !query || rowText.includes(query);
      const matchesStatus = status === "all" || rowStatus === status;
      const matchesUsage = usage === "all" || (usage === "active" && !used) || (usage === "used" && used);
      const visible = matchesQuery && matchesStatus && matchesUsage;
      row.style.display = visible ? "" : "none";
      row.classList.toggle("opacity-60", used);
      if (visible) visibleCount += 1;
    });

    if (countLabel) {
      countLabel.textContent = query || status !== "all" || usage !== "active" ? `${visibleCount} analyser vises` : "";
    }
  };

  const resetFilters = () => {
    searchInput.value = "";
    statusSelect.value = "all";
    usageSelect.value = "active";
    applyFilters();
    searchInput.focus();
  };

  searchInput.addEventListener("input", applyFilters);
  searchInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") applyFilters();
    if (event.key === "Escape") resetFilters();
  });
  statusSelect.addEventListener("change", applyFilters);
  usageSelect.addEventListener("change", applyFilters);
  applyButton?.addEventListener("click", applyFilters);
  resetButton?.addEventListener("click", resetFilters);
  applyFilters();
}

function protectUsedHistoryRows(root: HTMLElement) {
  getHistoryRows(root).forEach((row) => {
    const used = ["created_demo", "applied_to_demo"].includes(getStatus(row));
    const buttons = Array.from(row.querySelectorAll("button")) as HTMLButtonElement[];
    const createButton = buttons.find((button) => normalizeButtonText(button) === "Opprett demo");
    if (!createButton) return;

    if (used) {
      createButton.disabled = true;
      createButton.textContent = "Demo finnes";
      createButton.title = "Denne analysen er allerede brukt til demo.";
    } else {
      createButton.disabled = false;
      if (normalizeButtonText(createButton) === "Demo finnes") createButton.textContent = "Opprett demo";
      createButton.title = "Opprett demo fra denne analysen.";
    }
  });
}

function enhanceImportHistory() {
  const root = findHistoryRoot();
  if (!root) return;
  createHistoryFilters(root);
  protectUsedHistoryRows(root);
}

export function DemoSitesHistoryCreateButtonBridge() {
  useEffect(() => {
    if (window.location.pathname !== "/demosites") return;

    let pending = false;

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button) return;
      if (normalizeButtonText(button) !== "Opprett demo") return;
      if (!isInDemoSitesImportHistory(button)) return;
      if (button.disabled) return;
      if (pending) return;

      pending = true;
      let attempts = 0;
      const clickWhenReady = () => {
        attempts += 1;
        const reviewCreateButton = findReviewCreateButton();
        if (reviewCreateButton) {
          reviewCreateButton.click();
          pending = false;
          return;
        }
        if (attempts >= 12) {
          pending = false;
          return;
        }
        window.setTimeout(clickWhenReady, 100);
      };

      window.setTimeout(clickWhenReady, 100);
    };

    const observer = new MutationObserver(enhanceImportHistory);
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceImportHistory();

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      observer.disconnect();
    };
  }, []);

  return null;
}
