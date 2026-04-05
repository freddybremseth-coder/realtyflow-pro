import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { askClaude, isConfigured } from '@/services/ai/claude-client';
import { AgentOrchestrator } from '@/services/agents/orchestrator';
import {
  getChannelInfo,
  listVideos,
  updateVideoMetadata,
  listPlaylists,
  createPlaylist,
  addToPlaylist,
  isConfigured as ytConfigured,
} from '@/services/integrations/youtube-client';
import { publishToMultiplePlatforms } from '@/services/integrations/social-publisher';
import { sendEmail } from '@/services/email/smtp-sender';

export const maxDuration = 120;

/** Extract JSON from AI response that may contain markdown, preamble text, etc. */
function extractJSON(text: string): Record<string, unknown> {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const stripped = text.replace(/```(?:json)?\s*\n?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }
  throw new Error("Could not extract JSON from AI response");
}

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

  if (!isConfigured()) {
    return NextResponse.json({
      response:
        'Ingen AI-nøkler konfigurert. Legg til ANTHROPIC_API_KEY, GEMINI_API_KEY eller OPENAI_API_KEY.',
    });
  }

  const supabase = getSupabase();

  // If this is an execution command and we have a plan
  if (execute && currentPlan) {
    return executePlan(currentPlan, supabase);
  }

  // Otherwise, this is a planning conversation
  const systemPrompt = `Du er Victoria, CEO og strategisk leder for RealtyFlow Pro. Du er Freddys personlige AI-assistent som koordinerer 7 brands og alle AI-agenter.

VIKTIG: Du har EKTE tilgang til alle systemer nedenfor. Når du lager en plan og Freddy bekrefter, vil hvert steg FAKTISK utføres. Ikke late som - du gjør det ekte.

Dine agenter (kjører ekte oppgaver):
- Marketing Agent: Lager kampanjer, SoMe-innlegg, e-posttekster, A/B-tester. Kan publisere til Facebook, Instagram, LinkedIn, TikTok, Pinterest.
- Sales Agent: Lead-scoring, CRM-oppdateringer, oppfølgingsstrategier. Kan lese/skrive/flytte kontakter i pipeline.
- SEO Agent: Søkeordanalyse, on-page SEO, lenkestrategi, konkurrentanalyse.
- Business Agent: Markedsanalyse, vekststrategi, partnerskap, markedsrapporter.
- YouTube Agent: Manus, SEO-titler, beskrivelser, tags, thumbnail-konsepter. Kan oppdatere YouTube-metadata direkte.
- Multi-Domain Expert: Kryss-brand strategi og synergianalyse mellom alle 7 brands.
- Email AI: Skriver og SENDER e-poster via SMTP. Kan analysere innboks via IMAP.

Dine systemer (ekte operasjoner):
- CRM (system: "crm"): Les/skriv kontakter, flytt mellom pipeline-statuser (NEW→CONTACT→QUALIFIED→VIEWING→NEGOTIATION→WON/LOST), opprett nye leads. Har ${await getContactCount(supabase)} kontakter nå.
- Content Studio (system: "content-studio"): Generer og publiser innhold til SoMe-plattformer.
- E-post (system: "email"): Generer og send e-poster via SMTP. Kan inkludere mottaker, emne og brødtekst.
- Growth Engine (system: "growth-engine"): Kombinerer marketing + SEO for vekstoppgaver.
- Market Intelligence (system: "market-intelligence"): Markedsrapporter og analyse via Business Agent.
- Neural Beat (system: "neural-beat"): YouTube-kanal for AI-musikk. Kan hente statistikk, analysere ytelse, optimalisere metadata.
- Analytics (system: "analytics"): Henter EKTE data fra CRM (pipeline-tall), YouTube (visninger, abonnenter, topp-videoer), og vekstmotoren.

Brands: Soleada.no (eiendom Spania), Zen Eco Homes (øko-eiendom), ChatGenius.pro (AI SaaS), Dona Anna (oliveolje), Freddy Bremseth (personlig brand), Pinoso Ecolife (rural eiendom), Re-Master Freddy (AI-musikk YouTube, tidligere Neural Beat)

Regler for planlegging:
1. Bruk KONKRETE systemverdier i "system"-feltet (crm, content-studio, email, growth-engine, market-intelligence, neural-beat, analytics)
2. Skriv "description" så presist at systemet forstår hva det skal gjøre (f.eks. "Hent alle kontakter med status NEW" ikke bare "Sjekk CRM")
3. Hvis du trenger data først (analytics/crm), legg det som første steg
4. For e-post: inkluder mottakeradresse i description hvis kjent
5. For CRM-endringer: spesifiser hvilke statuser som er involvert

ABSOLUTT KRITISK REGEL - LES DETTE NØYE:
Du skal ALLTID lage en plan med handlinger. ALDRI bare si "jeg skal sjekke dette" eller "la meg undersøke" uten å lage en plan.

Eksempel på FEIL oppførsel: "Freddy, jeg kan sjekke dette for deg." ← DETTE ER FEIL. Du gjør ingenting!
Eksempel på RIKTIG oppførsel: Lag en plan med steg som faktisk henter data og utfører handlinger.

Hvis Freddy ber deg sjekke noe → lag en plan med analytics/crm/neural-beat steg.
Hvis Freddy ber deg gjøre noe → lag en plan med de relevante systemene.
Hvis Freddy bare sier "hei" eller stiller et generelt spørsmål → DA kan du svare med ren tekst.

Svarformat - FØLG DETTE NØYAKTIG:
- NESTEN ALLTID svar med JSON plan (og BARE JSON, ingen tekst utenfor JSON-objektet):
{"response": "Kort oppsummering til Freddy (maks 2 setninger)", "plan": {"title": "Kort tittel", "steps": [{"id": 1, "description": "Presis beskrivelse av hva som skal gjøres", "agent": "marketing|sales|seo|business|youtube|multi-domain|email|ceo", "system": "crm|content-studio|email|growth-engine|market-intelligence|neural-beat|analytics", "status": "pending"}]}}

- KUN ved rene hilsener eller generelle spørsmål uten handling: svar med REN TEKST. INGEN JSON.

KRITISK - ALDRI gjør noen av disse:
- Aldri vis JSON i "response"-feltet
- Aldri inkluder plan-strukturen inne i response-teksten
- Aldri bruk kodeblokker med backticks
- Aldri vis tekniske detaljer, objekter eller arrays
- Hold "response"-feltet KORT (maks 2 setninger)
- ALDRI si "jeg skal sjekke" eller "la meg undersøke" uten å faktisk lage en plan som gjør det`;

  // Build conversation as single prompt for askClaude
  let fullPrompt = '';
  if (conversation && conversation.length > 0) {
    for (const msg of conversation) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      fullPrompt += `${msg.role === 'user' ? 'Freddy' : 'Victoria'}: ${content}\n\n`;
    }
  }
  fullPrompt += `Freddy: ${message}`;

  try {
    const text = await askClaude(fullPrompt, {
      systemPrompt,
      maxTokens: 2000,
      model: 'sonnet',
    });

    // Try to parse as JSON (only if it contains a plan)
    try {
      const parsed = extractJSON(text);
      if (parsed && parsed.plan) {
        // Has a plan — ensure response field is clean text, not JSON
        const resp = typeof parsed.response === 'string' ? parsed.response : '';
        // Strip any accidental JSON/plan fragments from response text
        const cleanResp = resp
          .replace(/[{}\[\]]/g, '')
          .replace(/"[^"]*":/g, '')
          .replace(/,\s*$/g, '')
          .trim();
        return NextResponse.json({ response: cleanResp || 'Jeg har laget en plan for deg.', plan: parsed.plan });
      }
      if (parsed && parsed.response && typeof parsed.response === 'string') {
        // JSON with only response field — extract the text
        return NextResponse.json({ response: parsed.response });
      }
    } catch {
      // Not JSON — good, return as plain text
    }

    // Clean up any remaining JSON artifacts or code blocks from the text
    let cleanText = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    // If it looks like a truncated JSON response, extract readable text before the JSON
    if (cleanText.includes('{"') || cleanText.includes('", "plan"')) {
      const jsonStart = cleanText.indexOf('{"');
      if (jsonStart > 0) {
        cleanText = cleanText.substring(0, jsonStart).trim();
      }
      if (!cleanText || cleanText.length < 10) {
        cleanText = 'Jeg har behandlet forespørselen din, men klarte ikke å generere et fullstendig svar. Prøv igjen med en tydeligere instruksjon.';
      }
    }

    return NextResponse.json({ response: cleanText || text });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Ukjent feil';
    return NextResponse.json(
      { response: `Feil ved kontakt med AI: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function executePlan(
  plan: Plan,
  supabase: SupabaseClient | null,
) {
  const results: PlanStep[] = [...plan.steps];
  const executionLog: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const step = results[i];
    results[i] = { ...step, status: 'running' };

    try {
      const result = await executeStep(step, supabase);
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

// Singleton orchestrator for agent delegation
const orchestrator = new AgentOrchestrator();

async function getContactCount(supabase: SupabaseClient | null): Promise<string> {
  if (!supabase) return '0';
  try {
    const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    return String(count || 0);
  } catch { return '0'; }
}

async function executeStep(
  step: PlanStep,
  supabase: SupabaseClient | null,
): Promise<StepResult> {
  const desc = step.description.toLowerCase();

  switch (step.system) {
    case 'crm': {
      if (!supabase) throw new Error('Database ikke tilgjengelig');

      // READ operations
      if (desc.includes('hent') || desc.includes('finn') || desc.includes('vis') || desc.includes('list') || desc.includes('oversikt')) {
        const statusMatch = step.description.match(
          /(NEW|CONTACT|QUALIFIED|VIEWING|NEGOTIATION|WON|CUSTOMER|VIP|LOST)/i
        );
        let query = supabase.from('contacts').select('*');
        if (statusMatch) {
          query = query.eq('pipeline_status', statusMatch[1].toUpperCase());
        }
        const { data, error } = await query.order('updated_at', { ascending: false }).limit(50);
        if (error) throw new Error(error.message);
        const contacts = data || [];

        // Generate summary with AI
        const aiSummary = await askClaude(
          `Her er ${contacts.length} kontakter fra CRM:\n${contacts.map((c: Record<string, unknown>) => `- ${c.name} (${c.pipeline_status}, ${c.email || 'ingen epost'}, ${c.phone || 'ingen tlf'}, verdi: ${c.pipeline_value || 0})`).join('\n')}\n\nOppgave: ${step.description}\n\nGi en oppsummering og anbefalinger basert på dataene.`,
          { maxTokens: 1000, model: 'sonnet', systemPrompt: 'Du er en CRM-analytiker. Gi korte, konkrete oppsummeringer på norsk. Fokuser på handlingspunkter.' }
        );
        return { summary: aiSummary, data: { contacts, count: contacts.length } };
      }

      // WRITE operations - update contacts
      if (desc.includes('oppdater') || desc.includes('endre') || desc.includes('flytt') || desc.includes('sett')) {
        const statusMatch = step.description.match(
          /til\s+(NEW|CONTACT|QUALIFIED|VIEWING|NEGOTIATION|WON|CUSTOMER|VIP|LOST)/i
        );
        if (statusMatch) {
          // Find which contacts to update based on description
          const fromStatusMatch = step.description.match(
            /fra\s+(NEW|CONTACT|QUALIFIED|VIEWING|NEGOTIATION|WON|CUSTOMER|VIP|LOST)/i
          );
          if (fromStatusMatch) {
            const { data: toUpdate } = await supabase.from('contacts')
              .select('id, name').eq('pipeline_status', fromStatusMatch[1].toUpperCase());
            if (toUpdate && toUpdate.length > 0) {
              const { error } = await supabase.from('contacts')
                .update({ pipeline_status: statusMatch[1].toUpperCase(), updated_at: new Date().toISOString() })
                .eq('pipeline_status', fromStatusMatch[1].toUpperCase());
              if (error) throw new Error(error.message);
              return { summary: `Flyttet ${toUpdate.length} kontakter fra ${fromStatusMatch[1]} til ${statusMatch[1]}`, data: { updated: toUpdate.length } };
            }
          }
        }
      }

      // CREATE - add new contact
      if (desc.includes('opprett') || desc.includes('legg til') || desc.includes('ny kontakt')) {
        const aiResult = await askClaude(
          `Trekk ut kontaktinfo fra denne beskrivelsen: "${step.description}"\n\nReturner JSON: { "name": "...", "email": "...", "phone": "...", "source": "...", "notes": "..." }`,
          { maxTokens: 500, model: 'sonnet', systemPrompt: 'Returner BARE valid JSON. Fyll inn tomme strenger for manglende felt.' }
        );
        try {
          const contact = extractJSON(aiResult);
          const now = new Date().toISOString();
          const { data, error } = await supabase.from('contacts').insert({
            ...contact, pipeline_status: 'NEW', created_at: now, updated_at: now,
          }).select().single();
          if (error) throw new Error(error.message);
          return { summary: `Opprettet ny kontakt: ${data.name}`, data: { contact: data } };
        } catch {
          return { summary: 'Kunne ikke opprette kontakt fra beskrivelsen', data: {} };
        }
      }

      // Delegate to sales agent for complex CRM operations
      const agentResult = await orchestrator.executeCommand('sales', step.description);
      return { summary: agentResult.output, data: {} };
    }

    case 'email': {
      // Generate email content with AI
      const emailText = await askClaude(
        `Lag e-post basert på denne oppgaven: ${step.description}`,
        {
          systemPrompt: 'Du er Freddy Bremseth, eiendomsmegler i Spania. Skriv en kort, personlig e-post på norsk. Returner BARE JSON: { "to": "mottaker@epost.no", "subject": "Emne", "body": "Innhold" }. Hvis mottaker ikke er spesifisert, bruk "ukjent@ukjent.no".',
          maxTokens: 1500,
          model: 'sonnet',
        }
      );

      // Try to actually send the email if we have SMTP config
      try {
        const emailData = extractJSON(emailText) as Record<string, string>;
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
        const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

        if (smtpHost && smtpUser && smtpPass && emailData.to && emailData.to !== 'ukjent@ukjent.no') {
          await sendEmail(
            { host: smtpHost, port: parseInt(process.env.SMTP_PORT || '587'), secure: parseInt(process.env.SMTP_PORT || '587') === 465, email: smtpUser, password: smtpPass },
            { to: [emailData.to], subject: emailData.subject, bodyText: emailData.body }
          );
          return { summary: `E-post sendt til ${emailData.to}: "${emailData.subject}"`, data: { email: emailData, sent: true } };
        }
        return { summary: `E-post generert (ikke sendt - mangler SMTP eller mottaker): "${emailData.subject}"`, data: { email: emailData, sent: false } };
      } catch {
        return { summary: 'E-post generert som utkast', data: { draft: emailText, sent: false } };
      }
    }

    case 'content-studio': {
      // Use marketing agent for content creation
      const agentResult = await orchestrator.executeCommand('marketing', `Lag innhold: ${step.description}`);

      // If publishing is mentioned, try to publish
      if (desc.includes('publiser') || desc.includes('post') || desc.includes('del på')) {
        try {
          const platforms: string[] = [];
          if (desc.includes('facebook')) platforms.push('facebook');
          if (desc.includes('instagram')) platforms.push('instagram');
          if (desc.includes('linkedin')) platforms.push('linkedin');
          if (desc.includes('youtube')) platforms.push('youtube');
          if (desc.includes('tiktok')) platforms.push('tiktok');
          if (platforms.length === 0 && (desc.includes('alle') || desc.includes('sosialt'))) {
            platforms.push('facebook', 'instagram', 'linkedin');
          }

          if (platforms.length > 0) {
            // Extract content from agent result for publishing
            const contentForPublish = await askClaude(
              `Basert på dette innholdet, lag en kort, engasjerende post for sosiale medier:\n${agentResult.output}\n\nReturner BARE JSON: { "content": "postteksten", "hashtags": "#tag1 #tag2" }`,
              { maxTokens: 500, model: 'sonnet' }
            );
            return {
              summary: `Innhold generert av Marketing Agent og klargjort for ${platforms.join(', ')}:\n${agentResult.output.substring(0, 500)}`,
              data: { content: agentResult.output, platforms, publishContent: contentForPublish },
            };
          }
        } catch {
          // Fall through to just return content
        }
      }

      return { summary: `Innhold generert:\n${agentResult.output}`, data: { content: agentResult.output } };
    }

    case 'growth-engine': {
      // Use multiple agents for growth tasks
      const agents = ['marketing', 'seo'];
      if (desc.includes('lead')) agents.push('sales');
      const result = await orchestrator.runMultiAgentTask(step.description, agents);
      return { summary: result.synthesis, data: { agentResults: result.agentResults.map(r => ({ agent: r.agentName, output: r.output.substring(0, 300) })) } };
    }

    case 'analytics': {
      if (!supabase) throw new Error('Database ikke tilgjengelig');

      // Gather real data from all sources
      const analyticsData: Record<string, unknown> = {};

      // CRM Pipeline stats
      try {
        const { data } = await supabase.from('contacts').select('pipeline_status, pipeline_value, source, created_at');
        const contacts = data || [];
        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        let totalValue = 0;
        contacts.forEach((c: Record<string, unknown>) => {
          const status = (c.pipeline_status as string) || 'UNKNOWN';
          byStatus[status] = (byStatus[status] || 0) + 1;
          const source = (c.source as string) || 'Ukjent';
          bySource[source] = (bySource[source] || 0) + 1;
          totalValue += (c.pipeline_value as number) || 0;
        });
        analyticsData.crm = { type: 'crm', total: contacts.length, byStatus, bySource, totalValue };
      } catch {
        analyticsData.crm = { type: 'crm', total: 0, error: 'Kunne ikke hente CRM-data' };
      }

      // YouTube stats (if configured)
      if (ytConfigured()) {
        try {
          const [channel, videos] = await Promise.all([getChannelInfo(), listVideos(20)]);
          const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
          const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
          const topVideos = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
          analyticsData.youtube = {
            type: 'youtube',
            subscribers: channel.subscriberCount,
            totalViews: channel.viewCount,
            videoCount: channel.videoCount,
            channelTitle: channel.title,
            avgViews: videos.length > 0 ? Math.round(totalViews / videos.length) : 0,
            engagementRate: totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) + '%' : '0%',
            topVideos: topVideos.map(v => ({ title: v.title, views: v.viewCount, likes: v.likeCount })),
          };
        } catch {
          analyticsData.youtube = { type: 'youtube', error: 'YouTube ikke tilgjengelig' };
        }
      }

      // Recent growth actions
      try {
        const { data } = await supabase.from('growth_actions').select('*').order('created_at', { ascending: false }).limit(10);
        analyticsData.growth = { type: 'growth', actions: data || [], count: (data || []).length };
      } catch {
        analyticsData.growth = { type: 'growth', actions: [], count: 0 };
      }

      // AI summary of all data
      const aiSummary = await askClaude(
        `Her er oppdaterte analytics-data:\n${JSON.stringify(analyticsData, null, 2)}\n\nOppgave: ${step.description}\n\nGi en konsis, datadrevet oppsummering med nøkkeltall og anbefalinger.`,
        { maxTokens: 1500, model: 'sonnet', systemPrompt: 'Du er en analytics-ekspert. Gi korte, handlingsrettede oppsummeringer på norsk med konkrete tall.' }
      );

      return { summary: aiSummary, data: analyticsData };
    }

    case 'neural-beat': {
      if (!ytConfigured()) return { summary: 'YouTube er ikke konfigurert. Legg til YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET og YOUTUBE_REFRESH_TOKEN.', data: {} };

      // YouTube music channel operations
      if (desc.includes('statistikk') || desc.includes('analytics') || desc.includes('analyse') || desc.includes('analyser')) {
        const [channel, videos] = await Promise.all([getChannelInfo(), listVideos(50)]);
        const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
        const topVideos = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);

        const aiAnalysis = await askClaude(
          `Neural Beat YouTube-kanal:\nAbonnenter: ${channel.subscriberCount}\nTotale visninger: ${channel.viewCount}\nVideoer: ${channel.videoCount}\nTopp 10:\n${topVideos.map((v, i) => `${i+1}. "${v.title}" - ${v.viewCount} visninger, ${v.likeCount} likes`).join('\n')}\n\nAnalyser kanalens ytelse og gi konkrete virale strategier.`,
          { maxTokens: 1500, model: 'sonnet', systemPrompt: 'Du er en YouTube-vekststrateg for musikkkanaler. Gi konkrete, datadrevne anbefalinger på norsk.' }
        );
        return { summary: aiAnalysis, data: { channel, totalViews, topVideos: topVideos.slice(0, 5) } };
      }

      // Playlist operations - ACTUAL YouTube API calls
      if (desc.includes('spilleliste') || desc.includes('playlist')) {
        const existingPlaylists = await listPlaylists();

        if (desc.includes('opprett') || desc.includes('lag') || desc.includes('ny')) {
          // Use AI to determine playlist details from description
          const aiResult = await askClaude(
            `Basert på denne oppgaven: "${step.description}"\n\nOg eksisterende spillelister: ${existingPlaylists.map(p => `"${p.title}" (${p.itemCount} videoer)`).join(', ') || 'ingen'}\n\nBestem hvilke nye spillelister som bør opprettes. Returner JSON array: [{"title": "...", "description": "..."}]\nIkke opprett spillelister som allerede finnes.`,
            { maxTokens: 500, model: 'sonnet', systemPrompt: 'Returner BARE valid JSON array.' }
          );
          try {
            let playlistsToCreate: Array<{ title: string; description: string }> = [];
            try {
              const parsed = JSON.parse(aiResult.trim());
              playlistsToCreate = Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              const obj = extractJSON(aiResult);
              playlistsToCreate = Array.isArray(obj) ? obj as any : [obj] as any;
            }
            const created: string[] = [];
            for (const pl of playlistsToCreate) {
              if (!pl.title) continue;
              // Check if playlist already exists
              if (existingPlaylists.some(ep => ep.title.toLowerCase() === pl.title.toLowerCase())) {
                created.push(`"${pl.title}" finnes allerede`);
                continue;
              }
              const result = await createPlaylist(pl.title, pl.description || '');
              created.push(`"${result.title}" opprettet (${result.id})`);
            }
            // Optionally add videos to playlists
            const videos = await listVideos(50);
            if (videos.length > 0 && playlistsToCreate.length > 0) {
              const allPlaylists = await listPlaylists();
              const categorizeResult = await askClaude(
                `Videoer:\n${videos.map(v => `${v.id}: "${v.title}"`).join('\n')}\n\nSpillelister:\n${allPlaylists.map(p => `${p.id}: "${p.title}"`).join('\n')}\n\nKategoriser videoene i passende spillelister basert på tittel/tema. Returner JSON: [{"playlistId": "...", "videoId": "..."}]`,
                { maxTokens: 1500, model: 'sonnet', systemPrompt: 'Returner BARE valid JSON array. Hver video kan være i flere spillelister.' }
              );
              try {
                const assignments = JSON.parse(categorizeResult.trim().replace(/```json?\n?/g, '').replace(/```/g, ''));
                let addedCount = 0;
                for (const a of (Array.isArray(assignments) ? assignments : [])) {
                  try {
                    await addToPlaylist(a.playlistId, a.videoId);
                    addedCount++;
                  } catch { /* Video may already be in playlist */ }
                }
                if (addedCount > 0) created.push(`${addedCount} videoer lagt til i spillelister`);
              } catch { /* Categorization failed, skip */ }
            }
            return { summary: `Spillelister: ${created.join(', ')}`, data: { playlists: created, existing: existingPlaylists } };
          } catch {
            return { summary: 'Kunne ikke opprette spillelister fra AI-forslag', data: { existing: existingPlaylists } };
          }
        }
        // Just list playlists
        return { summary: `Eksisterende spillelister:\n${existingPlaylists.map(p => `- "${p.title}" (${p.itemCount} videoer)`).join('\n') || 'Ingen spillelister funnet'}`, data: { playlists: existingPlaylists } };
      }

      // Video metadata optimization - ACTUALLY update YouTube
      if (desc.includes('optimaliser') || desc.includes('seo') || desc.includes('tittel') || desc.includes('metadata') || desc.includes('oppdater')) {
        const videos = await listVideos(20);
        // Use AI to determine what to optimize
        const aiResult = await askClaude(
          `Her er Neural Beat sine siste videoer:\n${videos.map(v => `${v.id}: "${v.title}" (${v.viewCount} visninger, ${v.likeCount} likes)`).join('\n')}\n\nOppgave: ${step.description}\n\nForeslå metadata-oppdateringer for å forbedre SEO og viralitet. Returner JSON array: [{"videoId": "...", "title": "ny tittel (maks 100 tegn)", "description": "ny beskrivelse med CTA", "tags": ["tag1", "tag2"]}]\nBare inkluder videoer som trenger endringer.`,
          { maxTokens: 2000, model: 'sonnet', systemPrompt: 'Du er YouTube SEO-ekspert. Returner BARE valid JSON array.' }
        );
        try {
          const updates = JSON.parse(aiResult.trim().replace(/```json?\n?/g, '').replace(/```/g, ''));
          let updatedCount = 0;
          const details: string[] = [];
          for (const u of (Array.isArray(updates) ? updates : [])) {
            if (!u.videoId) continue;
            try {
              await updateVideoMetadata(u.videoId, {
                title: u.title,
                description: u.description,
                tags: u.tags,
              });
              updatedCount++;
              details.push(`"${u.title || 'oppdatert'}"`);
            } catch (e) {
              details.push(`Feilet for ${u.videoId}: ${e instanceof Error ? e.message : 'ukjent feil'}`);
            }
          }
          return { summary: `Oppdaterte metadata for ${updatedCount} videoer: ${details.join(', ')}`, data: { updatedCount, details } };
        } catch {
          // Delegate to YouTube agent as fallback
          const youtubeAgent = await orchestrator.executeCommand('youtube', step.description);
          return { summary: youtubeAgent.output, data: {} };
        }
      }

      // General YouTube operations
      const result = await orchestrator.executeCommand('youtube', step.description);
      return { summary: result.output, data: {} };
    }

    case 'market-intelligence': {
      // Use business agent for market analysis
      const result = await orchestrator.executeCommand('business', step.description);

      // Also check for market reports in DB
      if (supabase) {
        const { data: reports } = await supabase.from('market_reports')
          .select('*').order('created_at', { ascending: false }).limit(5);
        if (reports && reports.length > 0) {
          return {
            summary: `${result.output}\n\nSiste markedsrapporter:\n${reports.map((r: Record<string, unknown>) => `- ${r.title || 'Rapport'} (${new Date(r.created_at as string).toLocaleDateString('nb-NO')})`).join('\n')}`,
            data: { analysis: result.output, reports },
          };
        }
      }
      return { summary: result.output, data: {} };
    }

    default: {
      // For any unknown system, delegate to the specified agent
      if (step.agent && step.agent !== 'ceo') {
        const agentResult = await orchestrator.executeCommand(step.agent, step.description);
        return { summary: agentResult.output, data: {} };
      }
      // CEO handles it with AI
      const aiResult = await askClaude(step.description, {
        maxTokens: 1500,
        model: 'sonnet',
        systemPrompt: 'Du er Victoria, CEO AI-assistent. Utfør oppgaven grundig og gi et konkret resultat på norsk.',
      });
      return { summary: aiResult, data: {} };
    }
  }
}
