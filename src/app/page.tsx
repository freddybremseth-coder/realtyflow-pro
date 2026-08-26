"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { HOME_ROUTE_FALLBACK, homeRouteForRole } from "@/lib/home-route";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((body) => {
        if (!active || !body?.user) return;
        router.replace(homeRouteForRole(body.user.role));
      })
      .catch(() => {
        if (active) router.replace(HOME_ROUTE_FALLBACK);
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-5 py-4 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
        Åpner dagens arbeidsflate …
      </div>
    </main>
  );
}
