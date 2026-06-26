import type { Brand } from "@/types";
import { MONDEO_BRAND_ID } from "@/lib/mondeo";

export const MONDEO_BRAND: Brand = {
  id: MONDEO_BRAND_ID,
  name: "Mondeo Eiendom AS",
  type: "real_estate",
  description: "Intern oppfølging av Raveien 152E, Sandefjord",
  color: "#14b8a6",
  tone: "ryddig, kontrollert, dokumentert",
  target_audience: "Intern business-oppfølging",
  specialties: ["betalingsplan", "rente", "KPI", "sikkerhet"],
};

export function withMondeoBrand(brands: Brand[]) {
  return brands.some((brand) => brand.id === MONDEO_BRAND_ID)
    ? brands
    : [...brands, MONDEO_BRAND];
}
