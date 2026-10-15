import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { VisibilityProductConsole } from "@/components/visibility/visibility-product-console";
import { verifyAdminSession, verifyWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Nexus Visibility · Produktoversikt | RealtyFlow",
  description: "Selvstendig produktprototype for SEO, AEO, GEO, nettstedskontroll og dokumenterte anbefalinger.",
  robots: { index: false, follow: false },
};

export default async function VisibilityPage() {
  // The existing SEO API is owner-only and returns portfolio data across brands.
  // Keep the entire product prototype owner-only until tenant-scoped APIs and RLS exist.
  const jar = cookies();
  const session = await verifyAdminSession(jar.get("realtyflow_admin")?.value);
  if (session?.role !== "OWNER" ||
      await verifyWorkspacePreviewSession(jar.get(WORKSPACE_PREVIEW_COOKIE)?.value, session.email)) {
    notFound();
  }
  return <VisibilityProductConsole />;
}
