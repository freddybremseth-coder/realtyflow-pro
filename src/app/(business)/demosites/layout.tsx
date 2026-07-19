import type { ReactNode } from "react";
import { DemoSitesEnhancements } from "@/components/demosites/demosites-enhancements";

export default function DemoSitesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoSitesEnhancements />
      {children}
    </>
  );
}
