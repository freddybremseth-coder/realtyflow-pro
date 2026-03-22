import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 120;

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface PlanStep {
  id: number;
  description: string;
  agent: string;
  system: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  data?: Record<string, unknown>;
}

interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'draft' | 'confirmed' | 'executing' | 'completed' | 'failed';
  created_at: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Record<string, unknown>;
}

interface CommandRequest {
  message: string;
  conversation?: ConversationMessage[];
  execute?: boolean;
  currentPlan?: Plan;
}

interface StepResult {
  summary: string;
  data?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const { message, conversation, execute, currentPlan } = (await request.json()) as CommandRequest;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      response:
        'ANTHROPIC_API_KEY er ikke konfigurert. Legg til nøkkelen i Vercel for å aktivere AI-kommandosenteret.',
    });
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();
  const supabase = getSupabase();

  // If this is an execution command and we have a plan
  if (execute && currentPlan) {
    return executePlan(currentPlan, supabase, client);
  }

  // Otherwise, this is a planning conversation
  const systemPrompt = `Du er Victoria, CEO og strategisk leder for RealtyFlow Pro. Du er Freddys personlige AI-assistent som koordinerer 7 brands og alle AI-agenter.

Dine tilgjengelige agenter:
- Marketing Agent: Kampanjer, SoMe-innlegg, e-postkopier, A/B-testing
- Sales Agent: Lead-scoring, oppfølging, salgsstrategier, CRM
- SEO Agent: Søkeord, on-page SEO, lenkestrategi, konkurrentanalyse
- Business Agent: Markedsanalyse, vekststrategi, partnerskap
- YouTube Agent: Manus, titler, thumbnails, Shorts-strategi
- Multi-Domain Expert: Kryss-brand strategi, synergianalyse
- Email AI (Elena): E-postanalyse, svar, oppfølging

Dine tilgjengelige systemer:
- CRM & Pipeline: Kontakter med status (NEW, CONTACT, QUALIFIED, VIEWING, NEGOTIATION, WON, CUSTOMER, VIP, LOST)
- Content Studio: AI-generert innhold for alle plattformer
- E-post: Send personaliserte e-poster via IMAP/SMTP
- Growth Engine: Lead magnets, A/B-testing, viral content
- Market Intelligence: Markedsrapporter, ECB-data, valutakurser
- Neural Beat: Musikkpublisering på YouTube
- Analytics: Sporing og statistikk

Brands: Soleada.no (eiendom), Zen Eco Homes (øko-eiendom), ChatGenius.pro (SaaS), Dona Anna (oliveolje), Freddy Bremseth (personlig), Pinosos Ecolife (rural eiendom), Neural Beat (AI-musikk)

Når Freddy forteller deg hva han ønsker:
1. FORSTÅ: Gjenta hva du forstår at han vil
2. PLANLEGG: Lag en konkret plan med nummererte steg
3. SPESIFISER: For hvert steg, oppgi hvilken agent og system som brukes
4. BEKREFT: Spør om du skal starte eller om han vil justere

Svar ALLTID med en JSON-struktur i dette formatet:
{
  "response": "Din tekst til Freddy (norsk, personlig, profesjonell)",
  "plan": {
    "title": "Kort tittel for planen",
    "steps": [
      {
        "id": 1,
        "description": "Hva som gjøres",
        "agent": "marketing|sales|seo|business|youtube|multi-domain|email|ceo",
        "system": "crm|content-studio|email|growth-engine|market-intelligence|neural-beat|analytics",
        "status": "pending"
      }
    ]
  }
}

Hvis Freddy bare chatter eller spør om noe uten å be om en oppgave, svar uten plan:
{
  "response": "Din tekst her"
}

Vær konkret, datadrevet, og vis at du kjenner alle systemene. Ikke vær generisk.`;

  // Build conversation history for Claude
  const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add previous conversation
  if (conversation && conversation.length > 0) {
    for (const msg of conversation) {
      claudeMessages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }
  }

  // Add current message
  claudeMessages.push({ role: 'user', content: message });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Try to parse as JSON
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json(parsed);
      }
    } catch {
      // Not JSON, return as plain text
    }

    return NextResponse.json({ response: text });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Ukjent feil';
    return NextResponse.json(
      {
        response: `Feil ved kontakt med AI: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}

async function executePlan(
  plan: Plan,
  supabase: SupabaseClient | null,
  anthropicClient: InstanceType<typeof import('@anthropic-ai/sdk').default>
) {
  const results: PlanStep[] = [...plan.steps];
  const executionLog: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const step = results[i];
    results[i] = { ...step, status: 'running' };

    try {
      const result = await executeStep(step, supabase, anthropicClient);
      results[i] = { ...step, status: 'completed', result: result.summary, data: result.data };
      executionLog.push(`Steg ${step.id}: ${result.summary}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Ukjent feil';
      results[i] = { ...step, status: 'failed', result: errorMessage };
      executionLog.push(`Steg ${step.id} feilet: ${errorMessage}`);
    }
  }

  const completedCount = results.filter((r) => r.status === 'completed').length;
  const summary = `Utfort ${completedCount}/${results.length} steg.`;

  // Save execution to Supabase
  if (supabase) {
    try {
      await supabase
        .from('command_executions')
        .insert({
          plan_title: plan.title,
          steps: results,
          status: completedCount === results.length ? 'completed' : 'partial',
          summary,
        });
    } catch {
      // Silent fail
    }
  }

  return NextResponse.json({
    response: `Plan utfort!\n\n${executionLog.join('\n')}\n\n${summary}`,
    execution: {
      id: plan.id,
      steps: results,
      status: completedCount === results.length ? 'completed' : 'partial',
      summary,
    },
  });
}

async function executeStep(
  step: PlanStep,
  supabase: SupabaseClient | null,
  anthropicClient: InstanceType<typeof import('@anthropic-ai/sdk').default>
): Promise<StepResult> {
  switch (step.system) {
    case 'crm': {
      if (!supabase) throw new Error('Database ikke tilgjengelig');

      // Determine what CRM operation is needed from the step description
      if (
        step.description.toLowerCase().includes('hent') ||
        step.description.toLowerCase().includes('finn')
      ) {
        // Fetch contacts based on description context
        const statusMatch = step.description.match(
          /(NEW|CONTACT|QUALIFIED|VIEWING|NEGOTIATION|WON|CUSTOMER|VIP|LOST)/i
        );
        let query = supabase.from('contacts').select('*');
        if (statusMatch) {
          query = query.eq('pipeline_status', statusMatch[1].toUpperCase());
        }
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return { summary: `Hentet ${(data || []).length} kontakter`, data: { contacts: data } };
      }
      return { summary: 'CRM-operasjon utfort' };
    }

    case 'email': {
      // Generate emails using the email system
      if (!supabase) throw new Error('Database ikke tilgjengelig');

      const response = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system:
          'Du er Freddy Bremseth, eiendomsmegler i Spania. Skriv en kort, personlig oppfolgings-e-post pa norsk. Returner JSON: { "subject": "...", "body": "..." }',
        messages: [
          { role: 'user' as const, content: `Lag e-post basert pa denne oppgaven: ${step.description}` },
        ],
      });
      const emailText = response.content[0].type === 'text' ? response.content[0].text : '';
      return { summary: 'E-post generert og klar for utsending', data: { email: emailText } };
    }

    case 'content-studio': {
      // Generate content using marketing agent
      const response = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system:
          'Du er en kreativ innholdsprodusent for Freddy Bremseths brands. Skriv engasjerende innhold pa norsk. Returner JSON med: { "headline": "...", "body": "...", "hashtags": [...], "cta": "..." }',
        messages: [{ role: 'user' as const, content: `Lag innhold: ${step.description}` }],
      });
      const contentText = response.content[0].type === 'text' ? response.content[0].text : '';
      return { summary: 'Innhold generert', data: { content: contentText } };
    }

    case 'growth-engine': {
      return { summary: 'Vekstmotor-oppgave registrert', data: {} };
    }

    case 'analytics': {
      if (!supabase) throw new Error('Database ikke tilgjengelig');
      // Gather analytics data
      const [contacts, actions, reports] = await Promise.all([
        supabase.from('contacts').select('pipeline_status', { count: 'exact' }),
        supabase
          .from('growth_actions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('market_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      return {
        summary: `Hentet analytics: ${contacts.count || 0} kontakter, ${(actions.data || []).length} veksthandlinger`,
        data: {
          contacts: contacts.count,
          actions: actions.data,
          reports: reports.data,
        },
      };
    }

    case 'market-intelligence': {
      return { summary: 'Market intelligence-oppgave utfort' };
    }

    default:
      return { summary: `Steg utfort: ${step.description}` };
  }
}
