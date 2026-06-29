"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderFeesCard } from "@/components/demosites/order-fees-card";

type DemoSiteOrder = {
  id: string;
  company_name: string;
  order_number?: string | null;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  setup_cost_nok: number;
  monthly_cost_nok: number;
};

export default function DemoSitesFeesPage() {
  const [orders, setOrders] = useState<DemoSiteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente bestillinger.");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente bestillinger.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-300" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-white"><Wallet className="text-emerald-300" /> DemoSites priser</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Juster setup-pris, månedlig pris og interne kostnader per bestilling.</p>
      </div>

      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</div>}

      <div className="space-y-4">
        {orders.length === 0 ? (
          <Card className="border-slate-700/50 bg-slate-800/50"><CardContent className="p-8 text-center text-sm text-slate-400">Ingen bestillinger ennå.</CardContent></Card>
        ) : orders.map((order) => (
          <Card key={order.id} className="border-slate-700/50 bg-slate-800/50">
            <CardHeader>
              <CardTitle className="text-white">{order.company_name}</CardTitle>
              <CardDescription>{order.order_number || order.id}</CardDescription>
            </CardHeader>
            <CardContent>
              <OrderFeesCard
                orderId={order.id}
                setupFeeNok={order.setup_fee_nok}
                monthlyFeeNok={order.monthly_fee_nok}
                setupCostNok={order.setup_cost_nok}
                monthlyCostNok={order.monthly_cost_nok}
                onSaved={loadData}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
