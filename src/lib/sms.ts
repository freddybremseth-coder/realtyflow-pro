type SmsResult = { ok: true; sid: string } | { ok: false; reason: string };

function twilioConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function isSmsConfigured() {
  return twilioConfig() !== null;
}

export async function sendSms({ to, body }: { to: string; body: string }): Promise<SmsResult> {
  const cfg = twilioConfig();
  if (!cfg) return { ok: false, reason: "Twilio er ikke konfigurert" };
  const auth = Buffer.from(`${cfg.sid}:${cfg.token}`).toString("base64");
  const params = new URLSearchParams({ From: cfg.from, To: to, Body: body });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Twilio ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { sid?: string };
  return { ok: true, sid: data.sid || "unknown" };
}
