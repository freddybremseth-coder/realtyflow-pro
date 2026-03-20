import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export class GeminiService {
  private model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  async generatePropertyValuation(propertyData: Record<string, unknown>): Promise<string> {
    const prompt = `Du er en erfaren eiendomsmegler og takstmann i Spania (Costa Blanca / Costa Cálida).

Analyser denne eiendommen og gi en vurdering:

${JSON.stringify(propertyData, null, 2)}

Gi en rapport med:
1. Estimert pris (lav / megler-anbefaling / høy)
2. Sammenlignbare eiendommer i området
3. Markedsanalyse for området
4. Styrker og svakheter ved eiendommen
5. Anbefaling for prissetting

Svar på norsk. Bruk EUR som valuta.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  async generateMarketPulse(location: string, brandContext?: string): Promise<string> {
    const prompt = `Gi en ukentlig markedspuls for eiendomsmarkedet i ${location}, Spania.

${brandContext ? `Brand-kontekst: ${brandContext}` : ""}

Inkluder:
1. Pristrend siste uke
2. Nye listings og solgte eiendommer
3. Etterspørselsindikatorer
4. Muligheter for kjøpere/investorer
5. Kort prognose

Svar på norsk. Vær konkret med tall og trender.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  async extractLeadFromImage(imageBase64: string): Promise<Record<string, string>> {
    const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await visionModel.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64,
        },
      },
      `Analyser dette bildet (visittkort, skjema, eller kontaktinformasjon) og ekstraher følgende informasjon i JSON-format:
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "phone": "",
  "company": "",
  "location": "",
  "notes": ""
}

Returner KUN gyldig JSON, ingen annen tekst.`,
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not extract JSON from response");
    return JSON.parse(jsonMatch[0]);
  }

  async analyzeEmailThread(emails: string[]): Promise<string> {
    const prompt = `Analyser denne e-posttråden og gi en oppsummering:

${emails.join("\n\n---\n\n")}

Gi:
1. Oppsummering av samtalen
2. Sentiment-analyse (positiv/nøytral/negativ)
3. Nøkkelpunkter og handlingspunkter
4. Anbefalt oppfølging
5. Forslag til svar

Svar på norsk.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  async generateMarketingImage(prompt: string): Promise<string | null> {
    try {
      const imageModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await imageModel.generateContent(
        `Create a marketing image description for: ${prompt}. Describe the image in detail for a designer.`
      );
      return result.response.text();
    } catch {
      return null;
    }
  }

  async generateViralCopy(params: {
    platform: string;
    brand: string;
    topic: string;
    tone?: string;
  }): Promise<string> {
    const prompt = `Skriv viralt innhold for ${params.platform}.

Brand: ${params.brand}
Emne: ${params.topic}
Tone: ${params.tone || "engasjerende og profesjonell"}

Krav:
- Tilpasset ${params.platform}-formatet
- Hook i første setning
- Inkluder CTA
- 3-5 relevante hashtags
- Maks 2200 tegn for Instagram, 280 for Twitter, 3000 for LinkedIn

Svar på norsk.`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

export const geminiService = new GeminiService();
