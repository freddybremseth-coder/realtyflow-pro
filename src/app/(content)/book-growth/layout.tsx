import Link from "next/link";
import type { ReactNode } from "react";

const MODULES = [
  { href: "/book-growth", label: "Overview" },
  { href: "/book-growth/economics", label: "Economics" },
  { href: "/book-growth/series", label: "Series" },
  { href: "/book-growth/asins", label: "ASIN" },
  { href: "/book-growth/catalog-quality", label: "Catalog Quality" },
  { href: "/book-growth/work-review", label: "Work & Translation" },
  { href: "/book-growth/edition-language", label: "Edition & Language" },
  { href: "/book-growth/channel-metadata", label: "Channel Metadata" },
  { href: "/book-growth/measurement", label: "Measurement" },
  { href: "/book-growth/learning", label: "Learning" },
];

export default function BookGrowthLayout({ children }: { children: ReactNode }) {
  return <>
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "16px 24px 0", fontFamily: "system-ui, sans-serif" }}>
      <nav aria-label="Book Growth OS modules" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 10, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
        {MODULES.map((item) => <Link key={item.href} href={item.href} style={{ textDecoration: "none", padding: "7px 10px", borderRadius: 8, background: "#f8fafc", color: "#0f172a", fontSize: 12, fontWeight: 800, border: "1px solid #e2e8f0" }}>{item.label}</Link>)}
      </nav>
    </div>
    {children}
  </>;
}
