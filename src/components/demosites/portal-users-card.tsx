"use client";

/**
 * "Selgertilganger" — manage the chatgenius.pro seller portal accounts from
 * the RealtyFlow DemoSites CRM. Sellers log in at chatgenius.pro/selger and
 * only see the seller dashboard there; they never get RealtyFlow access.
 */
import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PortalUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Aldri";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function PortalUsersCard() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/saas/demosites/portal/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(Array.isArray(data.users) ? data.users : []);
        setWarning(data.warning || null);
      } else {
        setError(data.error || "Kunne ikke hente selgere.");
      }
    } catch {
      setError("Kunne ikke hente selgere.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/saas/demosites/portal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke opprette selger.");
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke opprette selger.");
    } finally {
      setSaving(false);
    }
  }

  async function patchUser(user: PortalUser, patch: Record<string, unknown>) {
    setBusyUserId(user.id);
    setError(null);
    try {
      const res = await fetch("/api/saas/demosites/portal/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke oppdatere selger.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke oppdatere selger.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetPassword(user: PortalUser) {
    const password = window.prompt(`Nytt passord for ${user.name} (minst 8 tegn):`);
    if (!password) return;
    await patchUser(user, { password });
    window.alert(`Passordet til ${user.name} er oppdatert. Gi det til selgeren manuelt.`);
  }

  return (
    <Card className="border-sky-500/20 bg-slate-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Users className="h-5 w-5 text-sky-300" />
          Selgertilganger (chatgenius.pro)
        </CardTitle>
        <CardDescription>
          Selgerne logger inn på chatgenius.pro/selger — aldri i RealtyFlow. Her styrer du hvem som har tilgang.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {warning && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{warning}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

        <form onSubmit={createUser} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 lg:grid-cols-[1fr_1fr_1fr_160px]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Navn</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">E-post</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Passord (minst 8 tegn)</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} type="text" className="h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-500" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="h-10 w-full bg-sky-600 hover:bg-sky-500">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Gi tilgang
            </Button>
          </div>
        </form>

        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">Laster selgere...</div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-500">Ingen selgere har tilgang ennå.</div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{user.name}</span>
                    <Badge className={user.is_active ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}>
                      {user.is_active ? "Aktiv" : "Deaktivert"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">{user.email} · Sist innlogget: {formatDateTime(user.last_login_at)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" className="border-slate-600 text-slate-200" disabled={busyUserId === user.id} onClick={() => resetPassword(user)}>
                    {busyUserId === user.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 h-3.5 w-3.5" />}
                    Nytt passord
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={user.is_active ? "border-red-500/50 text-red-200 hover:bg-red-500/10" : "border-emerald-500/50 text-emerald-200"}
                    disabled={busyUserId === user.id}
                    onClick={() => patchUser(user, { is_active: !user.is_active })}
                  >
                    {user.is_active ? "Deaktiver" : "Aktiver"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
