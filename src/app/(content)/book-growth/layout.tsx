import Link from "next/link";
import type { ReactNode } from "react";

const MODULES = [
  { href: "/book-growth", label: "Overview" },
  { href: "/book-growth/economics", label: "Economics" },
  { href: "/book-growth/series", label: "Series" },
  { href: "/book-growth/asins", label: "ASIN" },
  { href: "/book-growth/catalog-quality", label: "Catalog Quality" },
  { href: "/book-growth/file-reconciliation", label: "Book Files" },
  { href: "/book-growth/package-ingest", label: "Package Ingest" },
  { href: "/book-growth/canonical-catalog", label: "Canonical Catalogue" },
  { href: "/book-growth/quality-center", label: "Quality Center" },
  { href: "/book-growth/launch-factory", label: "Launch Factory" },
  { href: "/book-growth/sales-evidence", label: "Sales Evidence" },
  { href: "/book-growth/experiments", label: "Experiments" },
  { href: "/book-growth/work-review", label: "Work & Translation" },
  { href: "/book-growth/edition-language", label: "Edition & Language" },
  { href: "/book-growth/channel-metadata", label: "Channel Metadata" },
  { href: "/book-growth/distribution", label: "Distribution" },
  { href: "/book-growth/measurement", label: "Measurement" },
  { href: "/book-growth/learning", label: "Learning" },
];

export default function BookGrowthLayout({ children }: { children: ReactNode }) {
  return <div className="book-growth-contrast">
    <style>{`
      .book-growth-contrast {
        min-height: 100%;
        background: #e8eef6;
        color: #0b1220;
      }

      .book-growth-contrast h1,
      .book-growth-contrast h2,
      .book-growth-contrast h3,
      .book-growth-contrast b,
      .book-growth-contrast strong {
        color: #0b1220;
      }

      .book-growth-contrast section,
      .book-growth-contrast article,
      .book-growth-contrast table,
      .book-growth-contrast pre {
        border-color: #aebdce !important;
      }

      .book-growth-contrast section,
      .book-growth-contrast article {
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.06);
      }

      .book-growth-contrast p,
      .book-growth-contrast td,
      .book-growth-contrast summary,
      .book-growth-contrast div {
        text-rendering: optimizeLegibility;
      }

      .book-growth-contrast table td,
      .book-growth-contrast table th {
        border-color: #c0ccda !important;
      }

      .book-growth-contrast table th {
        background: #dfe7f1 !important;
        color: #111827 !important;
        font-weight: 800 !important;
      }

      .book-growth-contrast table tbody tr:nth-child(even) td {
        background: #f4f7fb;
      }

      .book-growth-contrast pre {
        color: #111827 !important;
      }

      .book-growth-contrast button,
      .book-growth-contrast a {
        outline-offset: 2px;
      }

      .book-growth-contrast button:focus-visible,
      .book-growth-contrast a:focus-visible {
        outline: 3px solid #2563eb;
      }
    `}</style>

    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "16px 24px 0", fontFamily: "system-ui, sans-serif" }}>
      <nav
        aria-label="Book Growth OS modules"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: 10,
          border: "1px solid #94a3b8",
          borderRadius: 12,
          background: "#0f172a",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
        }}
      >
        {MODULES.map((item) => <Link
          key={item.href}
          href={item.href}
          style={{
            textDecoration: "none",
            padding: "7px 10px",
            borderRadius: 8,
            background: "#f8fafc",
            color: "#0f172a",
            fontSize: 12,
            fontWeight: 900,
            border: "1px solid #94a3b8",
          }}
        >{item.label}</Link>)}
      </nav>
    </div>
    {children}
  </div>;
}