import { Suspense, type ReactNode } from "react";
import { WorkspaceSidebar } from "@/components/workspaces/workspace-sidebar";

export default function BrandWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { brandKey: string };
}) {
  return <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
    <Suspense fallback={<div className="hidden w-64 shrink-0 border-r border-slate-800 lg:block" />}>
      <WorkspaceSidebar brandKey={params.brandKey} />
    </Suspense>
    <div className="min-w-0 flex-1">{children}</div>
  </div>;
}
