import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { calculateValuation, normalizeValuationInput } from "@/lib/valuation/engine";
import { askClaude } from "@/services/ai/claude-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = normalizeValuationInput(body);
    const calculated = calculateValuation(input);

    let aiSummary = "";
    try {
      aiSummary = await askClaude(
        `Skriv en kort, profesjonell norsk megleroppsummering for en prisvurdering.

Eiendom:
${JSON.stringify(input, null, 2)}

Beregning:
${JSON.stringify({
  low: calculated.low,
  agent: calculated.agent,
  high: calculated.high,
  confidence: calculated.confidence,
  pricePerM2: calculated.pricePerM2,
  factors: calculated.factors,
  marketSignals: calculated.marketSignals,
}, null, 2)}

Krav:
- Maks 170 ord
- Ikke lat som dette er en formell takst
- Vær trygg, profesjonell og selgerorientert
- Forklar hvorfor Zen Eco Homes/RealtyFlow gir en solid vurdering`,
        { maxTokens: 700, temperature: 0.35, model: "sonnet" },
      );
    } catch {
      aiSummary = calculated.pricingStrategy;
    }

    const analysis = {
      ...calculated,
      aiSummary,
      input,
      generatedAt: new Date().toISOString(),
    };

    let data = null;
    let saveWarning: string | null = null;

    try {
      const supabase = createServerClient();
      let result = await supabase
        .from("saved_valuations")
        .insert({
          property_ref: input.ref || input.title || input.location,
          estimated_price_low: calculated.low,
          estimated_price_agent: calculated.agent,
          estimated_price_high: calculated.high,
          comparable_properties: calculated.comparable,
          market_analysis: JSON.stringify(analysis),
        })
        .select()
        .single();

      if (result.error && /estimated_price|comparable_properties|schema cache/i.test(result.error.message)) {
        result = await supabase
          .from("saved_valuations")
          .insert({
            property_ref: input.ref || input.title || input.location,
            market_analysis: JSON.stringify(analysis),
          })
          .select()
          .single();
      }

      if (result.error) {
        saveWarning = result.error.message;
      } else {
        data = result.data;
      }
    } catch (saveError) {
      saveWarning = saveError instanceof Error ? saveError.message : "Could not save valuation";
    }

    let emailResult: { success: boolean; error?: string; id?: string } | null = null;
    if (body.sendToSeller && input.sellerEmail) {
      emailResult = await sendSellerValuation({
        to: input.sellerEmail,
        subject: calculated.emailSubject,
        html: `<p>${aiSummary.replace(/\n/g, "<br>")}</p>${calculated.emailHtml}`,
      });
    }

    return NextResponse.json({ valuation: data, analysis, emailResult, saveWarning });
  } catch (error) {
    console.error("[Valuations]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

async function sendSellerValuation(params: { to: string; subject: string; html: string }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { success: false, error: "RESEND_API_KEY not configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Zen Eco Homes <reports@freddybremseth.com>",
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error };
  }

  const data = await response.json().catch(() => ({}));
  return { success: true, id: data.id as string | undefined };
}
