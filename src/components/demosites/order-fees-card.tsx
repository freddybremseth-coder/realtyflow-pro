"use client";

import { FormEvent, useState } from "react";
import { Loader2, Save, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OrderFeesCardProps = {
  orderId: string;
  setupFeeNok: number;
  monthlyFeeNok: number;
  setupCostNok: number;
  monthlyCostNok: number;
  onSaved?: () => void;
};

export function OrderFeesCard({ orderId, setupFeeNok, monthlyFeeNok, setupCostNok, monthlyCostNok, onSaved }: OrderFeesCardProps) {
  const [setupFee, setSetupFee] = useState(String(setupFeeNok || 0));
  const [monthlyFee, setMonthlyFee] = useState(String(monthlyFeeNok || 0));
  const [setupCost, setSetupCost] = useState(String(setupCostNok || 0));
  const [monthlyCost, setMonthlyCost] = useState(String(monthlyCostNok || 0));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveFees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/saas/demosites/fees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          setup_fee_nok: setupFee,
          monthly_fee_nok: monthlyFee,
          setup_cost_nok: setupCost,
          monthly_cost_nok: monthlyCost,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke lagre priser.");
      setMessage("Priser lagret.");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre priser.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-emerald-500/20 bg-slate-950/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-white"><Wallet className="h-4 w-4 text-emerald-300" />Priser</CardTitle>
        <CardDescription>Juster beløp for denne bestillingen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={saveFees} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FeeInput label="Setup" value={setupFee} onChange={setSetupFee} />
            <FeeInput label="Måned" value={monthlyFee} onChange={setMonthlyFee} />
            <FeeInput label="Setup-kost" value={setupCost} onChange={setSetupCost} />
            <FeeInput label="Mnd-kost" value={monthlyCost} onChange={setMonthlyCost} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">{message || "Endringer lagres kun for denne kunden."}</div>
            <Button type="submit" size="sm" disabled={saving} className="bg-emerald-600 hover:bg-emerald-500">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Lagre
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FeeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-white outline-none focus:border-emerald-500"
      />
    </label>
  );
}
