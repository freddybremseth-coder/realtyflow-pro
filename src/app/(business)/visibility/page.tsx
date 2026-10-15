import type { Metadata } from "next";
import { VisibilityProductConsole } from "@/components/visibility/visibility-product-console";

export const metadata: Metadata = {
  title: "Nexus Visibility · Produktoversikt | RealtyFlow",
  description: "Selvstendig produktprototype for SEO, AEO, GEO, nettstedskontroll og dokumenterte anbefalinger.",
  robots: { index: false, follow: false },
};

export default function VisibilityPage() {
  return <VisibilityProductConsole />;
}
