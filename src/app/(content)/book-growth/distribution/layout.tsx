import type { ReactNode } from "react";
import { DistributionFocusContext } from "@/components/book-growth/distribution-focus-context";

export default function DistributionLayout({ children }: { children: ReactNode }) {
  return <>
    <DistributionFocusContext />
    {children}
  </>;
}
