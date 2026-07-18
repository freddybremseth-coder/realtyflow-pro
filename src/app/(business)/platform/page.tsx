import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { loadPlatformSnapshot } from "@/services/platform/platform-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlatformPage() {
  if (headers().get("x-access-role") !== "OWNER") redirect("/");
  const supabase = getPlatformSupabase();
  if (!supabase) {
    return <div className="p-6 text-sm text-red-300">Supabase er ikke konfigurert for Platform Core.</div>;
  }
  try {
    const snapshot = await loadPlatformSnapshot(supabase);
    return <PlatformDashboard initialSnapshot={snapshot} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Platform Core kunne ikke lastes.";
    return <div role="alert" className="p-6 text-sm text-red-300">{message}</div>;
  }
}
