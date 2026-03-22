import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Send a text prompt to Claude and get a text response.
 * Uses claude-haiku-3.5 for fast, cheap text tasks.
 */
export async function askClaude(
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    model?: 'haiku' | 'sonnet';
  }
): Promise<string> {
  const claude = getClient();
  const model = options?.model === 'sonnet'
    ? 'claude-sonnet-4-20250514'
    : 'claude-3-5-haiku-20241022';

  const response = await claude.messages.create({
    model,
    max_tokens: options?.maxTokens ?? 1000,
    temperature: options?.temperature ?? 0.7,
    ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.text || '';
}

/**
 * Send an image + prompt to Claude for vision analysis.
 * Uses claude-haiku-3.5 which supports vision.
 */
export async function askClaudeWithImage(
  imageBase64: string,
  prompt: string,
  options?: {
    mimeType?: string;
    maxTokens?: number;
  }
): Promise<string> {
  const claude = getClient();

  const response = await claude.messages.create({
    model: 'claude-3-5-haiku-20241022',
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
}

export function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
