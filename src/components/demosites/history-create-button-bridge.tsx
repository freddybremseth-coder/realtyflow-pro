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
  filters.className = "mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_180px]";
  filters.innerHTML = `
    <input aria-label="Søk i analyser" placeholder="Søk i analyser..." class="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500" />
    <select aria-label="Statusfilter" class="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500">
      <option value="all">Alle statuser</option>
      <option value="analyzed">Analysert</option>
      <option value="created_demo">Demo opprettet</option>
      <option value="applied_to_demo">Brukt på demo</option>
    </select>
    <select aria-label="Visningsfilter" class="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-white outline-none focus:border-cyan-500">
      <option value="active">Skjul brukte</option>
      <option value="all">Vis alle</option>
      <option value="used">Kun brukte</option>
    </select>
  `;

  const list = root.querySelector(".mt-4.space-y-3");
  if (list) root.insertBefore(filters, list);

  const [searchInput, statusSelect, usageSelect] = Array.from(filters.querySelectorAll("input, select")) as HTMLInputElement[];
  const applyFilters = () => {
    const query = (searchInput.value || "").trim().toLowerCase();
    const status = statusSelect.value;
    const usage = usageSelect.value;

    getHistoryRows(root).forEach((row) => {
      const rowStatus = getStatus(row);
      const rowText = (row.textContent || "").toLowerCase();
      const used = rowStatus === "created_demo" || rowStatus === "applied_to_demo";
      const matchesQuery = !query || rowText.includes(query);
      const matchesStatus = status === "all" || rowStatus === status;
      const matchesUsage = usage === "all" || (usage === "active" && !used) || (usage === "used" && used);
      row.style.display = matchesQuery && matchesStatus && matchesUsage ? "" : "none";
      row.classList.toggle("opacity-60", used);
    });
  };

  filters.addEventListener("input", applyFilters);
  filters.addEventListener("change", applyFilters);
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
