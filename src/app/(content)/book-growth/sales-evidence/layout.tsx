import type { ReactNode } from "react";
import { SalesEvidenceFocusContext } from "@/components/book-growth/sales-evidence-focus-context";

export default function SalesEvidenceLayout({ children }: { children: ReactNode }) {
  return <>
    <SalesEvidenceFocusContext />
    {children}
  </>;
}
