import type { ReactNode } from "react";
import { LearningFocusContext } from "@/components/book-growth/learning-focus-context";

export default function LearningLayout({ children }: { children: ReactNode }) {
  return <>
    <LearningFocusContext />
    {children}
  </>;
}
