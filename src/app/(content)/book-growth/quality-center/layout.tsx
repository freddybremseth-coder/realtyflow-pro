import type { ReactNode } from "react";
import { QualityCenterFocusContext } from "@/components/book-growth/quality-center-focus-context";

export default function QualityCenterLayout({ children }: { children: ReactNode }) {
  return <>
    <QualityCenterFocusContext />
    {children}
  </>;
}
