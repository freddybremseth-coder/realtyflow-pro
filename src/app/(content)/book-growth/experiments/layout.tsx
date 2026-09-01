import type { ReactNode } from "react";
import { ExperimentsFocusContext } from "@/components/book-growth/experiments-focus-context";

export default function ExperimentsLayout({ children }: { children: ReactNode }) {
  return <>
    <ExperimentsFocusContext />
    {children}
  </>;
}
