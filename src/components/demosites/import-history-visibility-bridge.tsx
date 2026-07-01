"use client";

import { useEffect } from "react";

function selectLooksLikeImportUsageFilter(select: HTMLSelectElement) {
  const values = Array.from(select.options).map((option) => option.value).sort().join("|");
  return values === "active|all|used";
}

function setUsageFilterToAll() {
  if (!window.location.pathname.startsWith("/demosites")) return;

  const usageSelect = Array.from(document.querySelectorAll("select")).find((select): select is HTMLSelectElement => {
    return select instanceof HTMLSelectElement && selectLooksLikeImportUsageFilter(select);
  });

  if (!usageSelect || usageSelect.value === "all") return;

  usageSelect.value = "all";
  usageSelect.dispatchEvent(new Event("input", { bubbles: true }));
  usageSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

function attachResetHandler() {
  const buttons = Array.from(document.querySelectorAll("button"));
  const resetButton = buttons.find((button) => button.textContent?.trim() === "Nullstill");
  if (!resetButton || resetButton.getAttribute("data-demosites-history-visibility") === "attached") return;

  resetButton.setAttribute("data-demosites-history-visibility", "attached");
  resetButton.addEventListener("click", () => {
    window.setTimeout(setUsageFilterToAll, 50);
  });
}

export function ImportHistoryVisibilityBridge() {
  useEffect(() => {
    if (!window.location.pathname.startsWith("/demosites")) return;

    const run = () => {
      setUsageFilterToAll();
      attachResetHandler();
    };

    run();
    const interval = window.setInterval(run, 500);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 5000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
