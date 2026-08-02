import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { getProviderCapabilities } from "@/services/media/capabilities";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { providers: [] });
    if ("error" in context) return context.error;

    const capabilities = await getProviderCapabilities(
      context.supabase,
      context.scope.organizationId,
    );
    const gemini = capabilities.find((provider) => provider.provider === "gemini");
    const openart = capabilities.find((provider) => provider.provider === "openart");
    const fluxConfigured = Boolean(process.env.REPLICATE_API_TOKEN);

    return NextResponse.json({
      providers: [
        {
          id: "auto",
          label: "Auto",
          available: Boolean(gemini?.image.imageToImage || openart?.image.imageToImage || fluxConfigured),
          description: "Gemini for konsepter, OpenArt for variasjoner og Flux Kontext Pro for premium/fidelity-bilder.",
          estimatedUnitCostUsd: 0.03,
        },
        {
          id: "openart",
          label: "OpenArt",
          available: openart?.status === "available" && Boolean(openart.image.imageToImage),
          description: openart?.errorMessage || "Art-directed produktvariasjoner via den tilkoblede OpenArt-kontoen.",
          estimatedUnitCostUsd: 0.03,
          account: openart?.account || {},
        },
        {
          id: "gemini",
          label: "Gemini",
          available: gemini?.status === "available" && Boolean(gemini.image.imageToImage),
          description: gemini?.errorMessage || "Raske konsepter og rimelige kampanjevarianter.",
          estimatedUnitCostUsd: 0.02,
        },
        {
          id: "flux",
          label: "Flux Kontext Pro",
          available: fluxConfigured,
          description: fluxConfigured
            ? "Premium produkt- og etikettbevaring gjennom Replicate."
            : "REPLICATE_API_TOKEN er ikke konfigurert.",
          estimatedUnitCostUsd: 0.04,
        },
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}
