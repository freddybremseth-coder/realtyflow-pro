import type { Brand } from "@/types";
import { MONDEO_BRAND_ID } from "@/lib/mondeo";

export const MONDEO_BRAND: Brand = {
  id: MONDEO_BRAND_ID,
  name: "Mondeo Eiendom AS",
  type: "other",
  description: "Intern admin- og økonomioppfølging av Raveien 152E, Sandefjord",
  color: "#14b8a6",
  tone: "ryddig, kontrollert, dokumentert",
  target_audience: "Intern business-oppfølging",
  specialties: ["boligdrift", "utleie", "betalingsplan", "rente", "KPI", "sikkerhet"],
};

export function withMondeoBrand(brands: Brand[]) {
  return brands.some((brand) => brand.id === MONDEO_BRAND_ID)
    ? brands
    : [...brands, MONDEO_BRAND];
}
