import type { ReactNode } from "react";
import { DemoSitesEnhancements } from "@/components/demosites/demosites-enhancements";
import { DemoSitesOperations } from "@/components/demosites/demosites-operations";

export default function DemoSitesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoSitesOperations />
      <DemoSitesEnhancements />
      {children}
    </>
  );
}
