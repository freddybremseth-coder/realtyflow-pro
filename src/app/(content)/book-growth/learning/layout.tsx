import type { ReactNode } from "react";
import { LearningFocusContext } from "@/components/book-growth/learning-focus-context";
import { ApprovedNextBookIntakeLinks } from "@/components/book-growth/approved-next-book-intake-links";

export default function LearningLayout({ children }: { children: ReactNode }) {
  return <>
    <LearningFocusContext />
    <ApprovedNextBookIntakeLinks />
    {children}
  </>;
}
