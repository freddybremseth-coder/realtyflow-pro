import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

/**
 * POST /api/property-video
 *
 * action: "generate_seo" - Generate YouTube SEO title, description, tags for a property
 * action: "generate_description" - Generate engaging video description with CTA
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate_seo") {
      const { property, brand, language = "en" } = body;

      if (!property) {
        return NextResponse.json({ error: "Property data required" }, { status: 400 });
      }

      const client = getAnthropicClient();
      if (!client) {
        // Fallback without AI
        const title = `${property.type || "Property"} for Sale in ${property.location || "Spain"} - ${property.bedrooms || 0} Bed, €${Number(property.price || 0).toLocaleString()}`;
        return NextResponse.json({
          title,
          description: `Beautiful ${property.type} in ${property.location}. ${property.bedrooms} bedrooms, ${property.bathrooms} bathrooms, ${property.area || property.built_area}m². Price: €${Number(property.price || 0).toLocaleString()}`,
          tags: ["property", "spain", "real estate", property.location || "", property.type || ""].filter(Boolean),
        });
      }

      const langMap: Record<string, string> = {
        en: "English",
        no: "Norwegian",
        es: "Spanish",
        de: "German",
      };

      const prompt = `Generate YouTube SEO-optimized content for a real estate property video.

Property details:
- Type: ${property.type || property.property_type || "Property"}
- Location: ${property.location || property.town || "Spain"}
- Town: ${property.town || ""}
- Price: €${Number(property.price || 0).toLocaleString()}
- Bedrooms: ${property.bedrooms || 0}
- Bathrooms: ${property.bathrooms || 0}
- Built area: ${property.area || property.built_area || 0}m²
- Plot size: ${property.plotArea || property.plot_size || 0}m²
- Pool: ${property.pool ? "Yes" : "No"}
- Garage: ${property.garage ? "Yes" : "No"}
- Year built: ${property.yearBuilt || property.year_built || "N/A"}
- Energy rating: ${property.energyRating || property.energy_rating || "N/A"}
- Reference: ${property.ref || ""}

Brand: ${brand?.name || "Real Estate Agency"}
Website: ${brand?.website || ""}

Language: ${langMap[language] || "English"}

Generate:
1. title: A compelling YouTube title (max 70 chars). Use price, location, key features. Include emoji. Make it click-worthy but not clickbait.
2. description: Full YouTube description (300-500 words) with:
   - Engaging intro paragraph
   - Property details in readable format
   - Location highlights
   - CTA: Contact info, website link, "Like & Subscribe"
   - Relevant hashtags at the bottom
3. tags: Array of 15-20 relevant YouTube SEO tags

Return JSON only: {"title": "...", "description": "...", "tags": ["..."]}`;

      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const text = res.content.find((c) => c.type === "text")?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json(parsed);
      }

      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Property Video API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
