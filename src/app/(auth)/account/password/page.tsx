"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";

export default function AccountPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Passordet må være minst 8 tegn.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passordene er ikke like.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Kunne ikke oppdatere passordet.");
    } else {
      setMessage("Passordet er oppdatert.");
      setPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Endre passord</CardTitle>
            <p className="text-sm text-slate-400">Oppdater passordet for RealtyFlow-admin.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nytt passord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Gjenta nytt passord"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {message && <p className="text-sm text-emerald-400">{message}</p>}

              <div className="flex gap-3">
                <Button type="submit" disabled={loading}>
                  {loading ? "Lagrer..." : "Lagre passord"}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/")}>
                  Til oversikt
                </Button>
              </div>

              <p className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck size={14} /> Siden er bare tilgjengelig når du er logget inn som admin.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
