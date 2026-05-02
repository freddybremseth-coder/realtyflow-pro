// ─── POST /api/plots/:id/assets/:assetId/distribute ──────────────
// Send a plot asset to one of several destinations. Each call appends an
// entry to the asset's distribution_log.
//
// Body: {
//   target: "customer" | "content_studio" | "email" | "portal" | "website",
//   target_id?: string,        // customer id or content item id
//   email?: string,            // for target=email
//   subject?: string,          // for target=email
//   message?: string,          // for target=email or customer
// }
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { DistributionLogEntry, DistributionTarget } from "@/types/plot-assets";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } }
) {
  const body = await req.json();
  const target: DistributionTarget = body.target;
  if (!["customer", "content_studio", "email", "portal", "website"].includes(target)) {
    return NextResponse.json({ error: "Ugyldig 'target'" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: asset, error: assetErr } = await supabase
    .from("plot_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("plot_id", params.id)
    .single();
  if (assetErr || !asset) return NextResponse.json({ error: "Asset ikke funnet" }, { status: 404 });

  const { data: plot } = await supabase
    .from("land_plots")
    .select("plot_number, location, municipality")
    .eq("id", params.id)
    .single();
  const plotLabel = plot
    ? `${plot.plot_number ?? ""} ${plot.location ?? plot.municipality ?? ""}`.trim()
    : "tomt";

  const log: DistributionLogEntry[] = (asset.distribution_log ?? []) as DistributionLogEntry[];
  let result: { ok: boolean; detail?: string; target_id?: string } = { ok: false };

  try {
    switch (target) {
      // ─── Mark as visible on the public website ─────────────
      case "website": {
        await supabase
          .from("plot_assets")
          .update({ show_on_website: true })
          .eq("id", asset.id);
        result = { ok: true, detail: "Markert som synlig på nettsiden" };
        break;
      }

      // ─── Mark as visible in customer portal (Min side) ─────
      case "portal": {
        await supabase
          .from("plot_assets")
          .update({ visible_in_portal: true })
          .eq("id", asset.id);
        result = { ok: true, detail: "Markert som synlig i kundeportal" };
        break;
      }

      // ─── Make visible to a specific customer ───────────────
      case "customer": {
        if (!body.target_id) {
          return NextResponse.json({ error: "Mangler target_id (kunde-id)" }, { status: 400 });
        }
        const current = asset.visible_to_customer_ids ?? [];
        if (!current.includes(body.target_id)) current.push(body.target_id);
        await supabase
          .from("plot_assets")
          .update({ visible_to_customer_ids: current })
          .eq("id", asset.id);
        result = { ok: true, target_id: body.target_id, detail: "Synlig for kunde" };
        break;
      }

      // ─── Push to Content Hub / Studio as a work_item ──────
      case "content_studio": {
        const { data: workItem, error: wiErr } = await supabase
          .from("work_items")
          .insert({
            title: `Tomt-asset: ${asset.title || asset.filename} (${plotLabel})`,
            description: [
              `Tomt: ${plotLabel}`,
              asset.description || "",
              `URL: ${asset.public_url}`,
            ].filter(Boolean).join("\n"),
            status: "TO_DO",
            priority: "MEDIUM",
            source_type: "content",
            metadata: {
              plot_id: params.id,
              plot_asset_id: asset.id,
              kind: asset.kind,
              public_url: asset.public_url,
              tags: asset.tags,
            },
          })
          .select("id")
          .single();
        if (wiErr) throw wiErr;
        result = { ok: true, target_id: workItem.id, detail: "Sendt til Content Hub" };
        break;
      }

      // ─── Email the file/link to a recipient ────────────────
      case "email": {
        if (!body.email) {
          return NextResponse.json({ error: "Mangler email-adresse" }, { status: 400 });
        }
        const subject = body.subject
          || `Dokumenter for ${plotLabel}`;
        const message = body.message
          || `Hei,\n\nHer er filen "${asset.title || asset.filename}" fra tomten ${plotLabel}:\n\n${asset.public_url}\n\nMvh.`;

        // Try to send via existing email send endpoint (best-effort)
        try {
          const sendUrl = new URL("/api/email/send", req.url);
          await fetch(sendUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: body.email,
              subject,
              text: message,
              html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
            }),
          });
          result = { ok: true, detail: `Sendt til ${body.email}` };
        } catch (e) {
          // Even if send fails, log a manual fallback so user can copy the link
          result = { ok: false, detail: `Kunne ikke sende e-post automatisk: ${e instanceof Error ? e.message : e}` };
        }
        break;
      }
    }
  } catch (e) {
    result = { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  log.push({
    target,
    target_id: result.target_id,
    sent_at: new Date().toISOString(),
    status: result.ok ? "sent" : "failed",
    detail: result.detail,
  });
  await supabase
    .from("plot_assets")
    .update({ distribution_log: log })
    .eq("id", asset.id);

  return NextResponse.json({
    ok: result.ok,
    target,
    detail: result.detail,
    target_id: result.target_id,
  });
}
