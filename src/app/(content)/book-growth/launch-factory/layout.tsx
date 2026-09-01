import type { ReactNode } from "react";
import { LaunchFactoryFocusContext } from "@/components/book-growth/launch-factory-focus-context";

export default function LaunchFactoryLayout({ children }: { children: ReactNode }) {
  return <>
    <LaunchFactoryFocusContext />
    {children}
  </>;
}
