"use client";

import { useEffect } from "react";

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

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
