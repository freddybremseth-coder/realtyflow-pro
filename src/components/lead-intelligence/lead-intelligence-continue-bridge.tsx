"use client";

import { useEffect } from "react";
import { BRANDS } from "@/lib/constants";

const realEstateBrands = BRANDS.filter((brand) => brand.type === "real_estate");

type WorklistResponse = {
  ok: true;
  result: {
    items: Array<{
      buyerProfileId: string;
      latestPresentationId: string | null;
    }>;
  };
};

function hasProfile(body: WorklistResponse, buyerProfileId: string | null, presentationId: string | null) {
  return body.result.items.some((item) =>
    (buyerProfileId && item.buyerProfileId === buyerProfileId) ||
    (presentationId && item.latestPresentationId === presentationId),
  );
}

async function resolveBrandForProfile(buyerProfileId: string | null, presentationId: string | null) {
  const queryBrand = new URLSearchParams(window.location.search).get("brand");
  if (queryBrand && realEstateBrands.some((brand) => brand.id === queryBrand)) return queryBrand;

  for (const brand of realEstateBrands) {
    try {
      const params = new URLSearchParams({ brand: brand.id, limit: "50" });
      const response = await fetch(`/api/lead-intelligence/worklist?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as WorklistResponse | { ok: false };
      if (response.ok && body.ok && hasProfile(body, buyerProfileId, presentationId)) {
        return brand.id;
      }
    } catch {
      // Best-effort bridge only. The normal Lead Intelligence UI remains available.
    }
  }

  return null;
}

function dispatchBrandToSelects(brandId: string) {
  const selects = Array.from(document.querySelectorAll("select"));
  let changed = false;

  for (const select of selects) {
    const hasBrandOption = Array.from(select.options).some((option) => option.value === brandId);
    if (!hasBrandOption || select.value === brandId) continue;
    select.value = brandId;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    changed = true;
  }

  return changed;
}

function scrollToActiveProfile() {
  document.getElementById("lead-intelligence-active-profile")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function LeadIntelligenceContinueBridge({
  featureEnabled,
  persistenceEnabled,
}: {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
}) {
  useEffect(() => {
    if (!featureEnabled || !persistenceEnabled || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const buyerProfileId = params.get("buyerProfileId");
    const presentationId = params.get("presentationId");
    if (!buyerProfileId && !presentationId) return;

    let cancelled = false;
    let scrollTimer: number | null = null;

    async function bridge() {
      const brandId = await resolveBrandForProfile(buyerProfileId, presentationId);
      if (cancelled || !brandId) return;

      dispatchBrandToSelects(brandId);
      scrollTimer = window.setTimeout(scrollToActiveProfile, 1200);
    }

    void bridge();

    return () => {
      cancelled = true;
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
    };
  }, [featureEnabled, persistenceEnabled]);

  return null;
}
