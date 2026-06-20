import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

interface TextGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseMimeType?: 'application/json';
}

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ─── Fallback: Gemini text generation ──────────────────────────────

async function askGemini(
  prompt: string,
  options?: TextGenerationOptions
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const fullPrompt = options?.systemPrompt
    ? `${options.systemPrompt}\n\n${prompt}`
    : prompt;

  const generationConfig = {
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: options?.maxTokens ?? 1000,
    ...(options?.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
  };

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig,
  });

  return result.response.text() || '';
}

// ─── Fallback: OpenAI text generation ──────────────────────────────

async function askOpenAI(
  prompt: string,
  options?: TextGenerationOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const messages: Array<{ role: string; content: string }> = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
      ...(options?.responseMimeType === 'application/json'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Main: askClaude with automatic fallback ───────────────────────

/**
 * Send a text prompt to AI with automatic fallback chain:
 * Anthropic Claude → Google Gemini → OpenAI GPT
 *
 * Falls back transparently when credits run out or API errors occur.
 */
export async function askClaude(
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    responseMimeType?: 'application/json';
    model?: 'haiku' | 'sonnet';
  }
): Promise<string> {
  // Try Anthropic first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = getClient();
      const model = options?.model === 'sonnet'
        ? 'claude-sonnet-4-20250514'
        : 'claude-haiku-4-5-20251001';

      const response = await claude.messages.create({
        model,
        max_tokens: options?.maxTokens ?? 1000,
        temperature: options?.temperature ?? 0.7,
        ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text || '';
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || String(err);
      const isCredits = msg.includes('credit balance') || msg.includes('billing') || msg.includes('rate_limit');
      const isOverloaded = msg.includes('overloaded') || err?.status === 529;
      if (isCredits || isOverloaded || err?.status === 400 || err?.status === 429) {
        console.warn(`[AI Fallback] Anthropic unavailable (${err?.status || 'error'}), trying Gemini...`);
      } else {
        console.error(`[AI] Anthropic error:`, msg);
        // For unexpected errors, still try fallback
      }
    }
  }

  // Fallback 1: Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('[AI Fallback] Using Gemini');
      return await askGemini(prompt, options);
    } catch (err: any) {
      console.warn(`[AI Fallback] Gemini failed: ${err?.message || err}`);
    }
  }

  // Fallback 2: OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('[AI Fallback] Using OpenAI');
      return await askOpenAI(prompt, options);
    } catch (err: any) {
      console.warn(`[AI Fallback] OpenAI failed: ${err?.message || err}`);
    }
  }

  throw new Error('Alle AI-tjenester utilgjengelige. Sjekk API-nøkler og kreditter for Anthropic, Gemini eller OpenAI.');
}

// ─── askClaudeWithImage (with fallback) ────────────────────────────

/**
 * Send an image + prompt to AI for vision analysis.
 * Falls back to Gemini vision if Anthropic fails.
 */
export async function askClaudeWithImage(
  imageBase64: string,
  prompt: string,
  options?: {
    mimeType?: string;
    maxTokens?: number;
  }
): Promise<string> {
  // Try Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = getClient();
      const response = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: options?.maxTokens ?? 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: (options?.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock?.text || '';
    } catch (err: any) {
      console.warn(`[AI Fallback] Anthropic vision failed, trying Gemini vision...`);
    }
  }

  // Fallback: Gemini vision
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: options?.mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt },
          ],
        }],
      });
      return result.response.text() || '';
    } catch (err: any) {
      console.warn(`[AI Fallback] Gemini vision failed: ${err?.message}`);
    }
  }

  throw new Error('Ingen AI-tjenester med bildeanalyse tilgjengelig.');
}

export function isConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export function getConfiguredAIProviders() {
  return [
    { id: 'anthropic', name: 'Anthropic Claude', configured: !!process.env.ANTHROPIC_API_KEY, priority: 1 },
    { id: 'gemini', name: 'Google Gemini', configured: !!process.env.GEMINI_API_KEY, priority: 2 },
    { id: 'openai', name: 'OpenAI', configured: !!process.env.OPENAI_API_KEY, priority: 3 },
  ];
}
