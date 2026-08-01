import {
  QUALITY_SCORE_CATEGORIES,
  type BrandProfileInput,
  type QualityScoreCategory,
  type ScoreBreakdownItem,
  type SocialPerformanceMetrics,
  type SocialQualityScore,
} from "./contracts";

export interface SocialSectionLike {
  section_type?: string | null;
  current_content?: string | null;
  optimized_content?: string | null;
  approved_content?: string | null;
  score?: number | null;
}

export interface SocialPostLike {
  id?: string | null;
  content?: string | null;
  status?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  quality_score?: number | null;
  quality_analysis_json?: unknown;
  pillar_id?: string | null;
  hook_type?: string | null;
  cta_type?: string | null;
  title?: string | null;
}

export interface SocialMetricLike {
  post_id?: string | null;
  recorded_at?: string | null;
  impressions?: number | null;
  reach?: number | null;
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  clicks?: number | null;
  profile_views?: number | null;
  followers_gained?: number | null;
  messages?: number | null;
  leads?: number | null;
  meetings?: number | null;
  sales?: number | null;
}

export interface SocialOverviewScores {
  personalBrandScore: ScoreBreakdownItem;
  profileScore: ScoreBreakdownItem;
  authorityScore: ScoreBreakdownItem;
  contentScore: ScoreBreakdownItem;
  consistencyScore: ScoreBreakdownItem;
  networkScore: ScoreBreakdownItem;
  engagementScore: ScoreBreakdownItem;
  leadPotentialScore: ScoreBreakdownItem;
}

interface SocialMetricTotals {
  impressions: number;
  reach: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  followersGained: number;
  leads: number;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: Array<number | null | undefined>) {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numeric.length) return null;
  return clampScore(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function populated(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function completionScore(entries: unknown[]) {
  if (!entries.length) return null;
  return clampScore((entries.filter(populated).length / entries.length) * 100);
}

function notEnough(label: string, explanation: string, suggestions: string[]): ScoreBreakdownItem {
  return {
    key: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    score: null,
    explanation,
    suggestions,
    dataAvailable: false,
  };
}

function scoreItem(label: string, score: number, explanation: string, suggestions: string[] = []): ScoreBreakdownItem {
  return {
    key: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    score: clampScore(score),
    explanation,
    suggestions,
    dataAvailable: true,
  };
}

export function buildProfileScore(profile: Partial<BrandProfileInput> | null | undefined, sections: SocialSectionLike[] = []) {
  if (!profile) {
    return notEnough("Profile Score", "Ikke nok data ennå. Opprett Brand Profile for å beregne profilsum.", [
      "Fyll ut rolle, målgruppe, tjenester, ekspertområder og ønsket posisjonering.",
    ]);
  }

  const profileCompletion = completionScore([
    profile.professionalName,
    profile.currentPosition,
    profile.primaryRole,
    profile.companyName,
    profile.location,
    profile.targetAudiences,
    profile.services,
    profile.expertise,
    profile.positioningGoal,
    profile.preferredTones,
  ]) ?? 0;
  const sectionAverage = average(sections.map((section) => section.score ?? null));
  const score = average([profileCompletion, sectionAverage ?? profileCompletion]) ?? profileCompletion;
  const suggestions = [
    profile.positioningGoal ? null : "Legg inn en tydelig posisjonering.",
    profile.targetAudiences?.length ? null : "Definer målgruppen profilen skal treffe.",
    profile.expertise?.length ? null : "Legg til ekspertområder som faktisk bygger på erfaring.",
  ].filter((item): item is string => Boolean(item));

  return scoreItem(
    "Profile Score",
    score,
    "Beregnet fra utfylte brand profile-felt og lagrede LinkedIn-seksjonsscore.",
    suggestions,
  );
}

export function buildOverviewScores(params: {
  profile?: Partial<BrandProfileInput> | null;
  sections?: SocialSectionLike[];
  skillCount?: number;
  pillarCount?: number;
  ideaCount?: number;
  posts?: SocialPostLike[];
  metrics?: SocialMetricLike[];
  crmLinkCount?: number;
}): SocialOverviewScores {
  const sections = params.sections || [];
  const posts = params.posts || [];
  const metrics = params.metrics || [];
  const publishedPosts = posts.filter((post) => post.status === "published" || post.published_at);
  const recentPosts = posts.filter((post) => {
    const date = post.published_at || post.scheduled_at;
    if (!date) return false;
    return Date.now() - new Date(date).getTime() <= 30 * 24 * 60 * 60 * 1000;
  });
  const profileScore = buildProfileScore(params.profile, sections);

  const authorityScore = params.skillCount || params.pillarCount
    ? scoreItem(
        "Authority Score",
        clampScore(((params.skillCount || 0) >= 6 ? 45 : (params.skillCount || 0) * 7) + ((params.pillarCount || 0) >= 3 ? 35 : (params.pillarCount || 0) * 12) + (params.profile?.positioningGoal ? 20 : 0)),
        "Beregnet fra verifiserbare skills, innholdspilarer og tydelig posisjonering.",
        (params.skillCount || 0) < 5 ? ["Legg til flere skills som kan knyttes til konkret erfaring."] : [],
      )
    : notEnough("Authority Score", "Ikke nok data ennå. Autoritet krever skills, innholdspilarer og posisjonering.", [
        "Kjør første profilanalyse og godkjenn relevante skills.",
      ]);

  const contentScore = posts.length || params.ideaCount
    ? scoreItem(
        "Content Score",
        clampScore(((params.ideaCount || 0) >= 8 ? 30 : (params.ideaCount || 0) * 4) + (posts.length >= 4 ? 35 : posts.length * 8) + (average(posts.map((post) => post.quality_score ?? null)) || 0) * 0.35),
        "Beregnet fra idebank, antall innlegg og kvalitetsscore på innlegg.",
        posts.length < 3 ? ["Lag minst tre innlegg i Post Studio for bedre innholdsscore."] : [],
      )
    : notEnough("Content Score", "Ikke nok data ennå. Opprett innholdsideer eller innlegg for å beregne score.", [
        "Generer ideer fra profilen og lag første LinkedIn-utkast.",
      ]);

  const consistencyScore = publishedPosts.length >= 2
    ? scoreItem(
        "Consistency Score",
        recentPosts.length >= 4 ? 85 : recentPosts.length >= 2 ? 62 : 38,
        "Beregnet fra planlagte og publiserte innlegg de siste 30 dagene.",
        recentPosts.length < 4 ? ["Planlegg en enkel ukentlig publiseringsrytme."] : [],
      )
    : notEnough("Consistency Score", "Ikke nok data ennå. Minst to publiserte eller planlagte innlegg trengs.", [
        "Legg minst to innlegg i kalenderen.",
      ]);

  const performance = calculatePerformanceMetrics(metrics);
  const engagementScore = performance.engagementRate === null
    ? notEnough("Engagement Score", "Ikke nok data ennå. Registrer manuelle resultater for publiserte innlegg.", [
        "Legg inn visninger, reaksjoner, kommentarer og delinger på minst tre innlegg.",
      ])
    : scoreItem(
        "Engagement Score",
        clampScore(Math.min(100, performance.engagementRate * 1200)),
        "Beregnet fra reaksjoner, kommentarer, delinger og lagringer delt på impressions.",
        performance.dataWarning ? [performance.dataWarning] : [],
      );

  const leadMetrics = metrics.reduce(
    (sum, metric) => sum + (metric.leads || 0) + (metric.meetings || 0) * 2 + (metric.sales || 0) * 5,
    0,
  );
  const leadPotentialScore = metrics.length || params.crmLinkCount
    ? scoreItem(
        "Lead Potential Score",
        clampScore((params.crmLinkCount || 0) * 18 + leadMetrics * 12 + (performance.leadConversionRate || 0) * 1500),
        "Beregnet fra CRM-koblinger, registrerte leads, møter, salg og lead conversion.",
        !params.crmLinkCount ? ["Koble minst ett innlegg til lead, kontakt, property eller kampanje."] : [],
      )
    : notEnough("Lead Potential Score", "Ikke nok data ennå. Koble innlegg til CRM eller registrer leads fra innlegg.", [
        "Bruk CRM-kobling på innlegg som skaper henvendelser.",
      ]);

  const networkScore = notEnough("Network Score", "Network Intelligence er klargjort for senere fase, men ikke beregnet i MVP 1.", [
    "Registrer nettverksmål i neste fase for å få score.",
  ]);

  const personalBrandScore = average([
    profileScore.score,
    authorityScore.score,
    contentScore.score,
    consistencyScore.score,
    engagementScore.score,
    leadPotentialScore.score,
  ]);

  return {
    personalBrandScore: personalBrandScore === null
      ? notEnough("Personal Brand Score", "Ikke nok data ennå. Fullfør onboarding og første analyse.", [
          "Fyll ut Brand Profile, lim inn LinkedIn-tekst og lag første innlegg.",
        ])
      : scoreItem(
          "Personal Brand Score",
          personalBrandScore,
          "Gjennomsnitt av tilgjengelige delscore. Manglende delscore holdes utenfor, ikke estimert.",
          [],
        ),
    profileScore,
    authorityScore,
    contentScore,
    consistencyScore,
    networkScore,
    engagementScore,
    leadPotentialScore,
  };
}

function hasQuestion(text: string) {
  return /\?/.test(text);
}

function hasSpecificity(text: string) {
  return /\b\d+([.,]\d+)?\b|Costa|Alicante|Madrid|Oslo|LinkedIn|CRM|AI|SaaS|bolig|eiendom/i.test(text);
}

function hasCta(text: string) {
  return /\b(kontakt|send|book|last ned|kommenter|skriv|ta kontakt|message|connect|download|reply|comment)\b/i.test(text);
}

function sentenceCount(text: string) {
  return text.split(/[.!?]\s+/).map((row) => row.trim()).filter(Boolean).length;
}

function wordCount(text: string) {
  return text.split(/\s+/).map((row) => row.trim()).filter(Boolean).length;
}

function category(key: QualityScoreCategory, score: number, explanation: string, suggestions: string[]): ScoreBreakdownItem {
  const labels: Record<QualityScoreCategory, string> = {
    hookStrength: "Hook Strength",
    clarity: "Clarity",
    relevance: "Relevance",
    credibility: "Credibility",
    readability: "Readability",
    specificity: "Specificity",
    personalVoice: "Personal Voice",
    value: "Value",
    callToAction: "Call to Action",
    brandConsistency: "Brand Consistency",
    platformFit: "Platform Fit",
  };
  return {
    key,
    label: labels[key],
    score: clampScore(score),
    explanation,
    suggestions,
    dataAvailable: true,
  };
}

export function scoreSocialPost(input: {
  content: string;
  targetAudience?: string | null;
  goal?: string | null;
  tone?: string[] | null;
  platform?: string | null;
  brandKeywords?: string[];
}): SocialQualityScore {
  const content = input.content.trim();
  const words = wordCount(content);
  const firstLine = content.split(/\n+/).find(Boolean) || content;
  const sentences = sentenceCount(content);
  const brandKeywords = input.brandKeywords || [];
  const lower = content.toLowerCase();

  const categories: Record<QualityScoreCategory, ScoreBreakdownItem> = {
    hookStrength: category(
      "hookStrength",
      clampScore((firstLine.length <= 160 ? 35 : 15) + (hasQuestion(firstLine) ? 20 : 0) + (hasSpecificity(firstLine) ? 25 : 0) + (firstLine.length >= 30 ? 20 : 10)),
      "Vurderer første linje ut fra lengde, konkretisering og om den gir leseren en grunn til å stoppe.",
      firstLine.length > 160 ? ["Kort ned åpningen slik at poenget synes før LinkedIn kutter teksten."] : [],
    ),
    clarity: category(
      "clarity",
      clampScore(35 + (sentences >= 3 ? 20 : 5) + (words >= 80 && words <= 260 ? 30 : 15) + (/\n/.test(content) ? 15 : 5)),
      "Vurderer struktur, avsnitt og om teksten har nok kontekst uten å bli for lang.",
      /\n/.test(content) ? [] : ["Del teksten i korte avsnitt for bedre LinkedIn-lesbarhet."],
    ),
    relevance: category(
      "relevance",
      clampScore(45 + (input.targetAudience ? 25 : 0) + (input.goal ? 20 : 0) + (brandKeywords.some((keyword) => lower.includes(keyword.toLowerCase())) ? 10 : 0)),
      "Vurderer om innlegget er knyttet til målgruppe, mål og merkevaretema.",
      input.targetAudience ? [] : ["Velg målgruppe før innlegget publiseres."],
    ),
    credibility: category(
      "credibility",
      clampScore(45 + (hasSpecificity(content) ? 25 : 0) + (/\b(jeg|vi|min|vår|erfaring|kunde|case)\b/i.test(content) ? 20 : 0) - (/\bbest|garantert|nummer 1|revolusjonerende\b/i.test(content) ? 20 : 0)),
      "Vurderer om påstandene virker dokumenterbare og ikke overdrevne.",
      /\bbest|garantert|nummer 1|revolusjonerende\b/i.test(content) ? ["Fjern eller dokumenter sterke superlativer."] : [],
    ),
    readability: category(
      "readability",
      clampScore(90 - Math.max(0, words - 260) * 0.2 - Math.max(0, 50 - words) * 0.4 + (/\n/.test(content) ? 8 : -8)),
      "Vurderer lengde, avsnitt og skannbarhet.",
      words > 280 ? ["Kort ned teksten eller del den i en artikkel/carousel."] : [],
    ),
    specificity: category(
      "specificity",
      hasSpecificity(content) ? 78 : 42,
      "Vurderer konkrete detaljer som tall, steder, prosesser, marked eller tydelig eksempel.",
      hasSpecificity(content) ? [] : ["Legg til et konkret eksempel, sted, tall eller kundeproblem."],
    ),
    personalVoice: category(
      "personalVoice",
      /\b(jeg|min|mitt|vi|vår|erfarte|lærte|så)\b/i.test(content) ? 76 : 45,
      "Vurderer om innlegget har menneskelig avsender, uten å kreve privat innhold.",
      /\b(jeg|min|mitt|vi|vår)\b/i.test(content) ? [] : ["Legg til en kort observasjon fra egen arbeidshverdag."],
    ),
    value: category(
      "value",
      /\b(tips|råd|slik|derfor|unngå|lær|forklarer|checklist|guide)\b/i.test(content) ? 82 : 55,
      "Vurderer om leseren får innsikt, råd eller et tydelig perspektiv.",
      /\b(tips|råd|slik|derfor|unngå|lær|forklarer)\b/i.test(content) ? [] : ["Gjør verdien tydeligere: hva lærer leseren?"],
    ),
    callToAction: category(
      "callToAction",
      hasCta(content) ? 82 : 38,
      "Vurderer om teksten har en profesjonell, ikke-masete neste handling.",
      hasCta(content) ? [] : ["Legg til en enkel CTA, for eksempel et spørsmål eller invitasjon til dialog."],
    ),
    brandConsistency: category(
      "brandConsistency",
      clampScore(55 + (input.tone?.length ? 15 : 0) + (brandKeywords.some((keyword) => lower.includes(keyword.toLowerCase())) ? 25 : 0)),
      "Vurderer samsvar med valgt tone og kjente brand-temaer.",
      input.tone?.length ? [] : ["Velg tone for å kontrollere merkevarekonsistens."],
    ),
    platformFit: category(
      "platformFit",
      clampScore((input.platform === "linkedin" ? 35 : 20) + (words >= 70 && words <= 260 ? 35 : 18) + (/\n/.test(content) ? 15 : 5) + (hasCta(content) ? 15 : 5)),
      "Vurderer LinkedIn-format: lesbar lengde, tydelig åpning, avsnitt og CTA.",
      words < 50 ? ["Gjør innlegget mer substansielt for LinkedIn."] : [],
    ),
  };

  const total = average(QUALITY_SCORE_CATEGORIES.map((key) => categories[key].score)) || 0;
  return {
    total,
    disclaimer: "Denne scoren vurderer kvalitet og plattformtilpasning. Den garanterer ikke rekkevidde eller engasjement.",
    categories,
  };
}

function safeRate(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

export function calculatePerformanceMetrics(metrics: SocialMetricLike[]): SocialPerformanceMetrics {
  const totals = metrics.reduce<SocialMetricTotals>(
    (sum, metric) => ({
      impressions: sum.impressions + (metric.impressions || 0),
      reach: sum.reach + (metric.reach || 0),
      reactions: sum.reactions + (metric.reactions || 0),
      comments: sum.comments + (metric.comments || 0),
      shares: sum.shares + (metric.shares || 0),
      saves: sum.saves + (metric.saves || 0),
      clicks: sum.clicks + (metric.clicks || 0),
      followersGained: sum.followersGained + (metric.followers_gained || 0),
      leads: sum.leads + (metric.leads || 0),
    }),
    {
      impressions: 0,
      reach: 0,
      reactions: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: 0,
      followersGained: 0,
      leads: 0,
    },
  );

  const engagement = totals.reactions + totals.comments + totals.shares + totals.saves;
  return {
    engagementRate: safeRate(engagement, totals.impressions),
    commentsPerThousand: totals.impressions ? Number(((totals.comments / totals.impressions) * 1000).toFixed(2)) : null,
    sharesPerThousand: totals.impressions ? Number(((totals.shares / totals.impressions) * 1000).toFixed(2)) : null,
    clickRate: safeRate(totals.clicks, totals.impressions),
    leadConversionRate: safeRate(totals.leads, totals.clicks || totals.impressions),
    followerConversionRate: safeRate(totals.followersGained, totals.impressions),
    formulas: {
      engagementRate: "(reactions + comments + shares + saves) / impressions",
      commentsPerThousand: "comments / impressions * 1000",
      sharesPerThousand: "shares / impressions * 1000",
      clickRate: "clicks / impressions",
      leadConversionRate: "leads / clicks, or leads / impressions when clicks are missing",
      followerConversionRate: "followers gained / impressions",
    },
    dataWarning: metrics.length > 0 && metrics.length < 3
      ? `Datagrunnlaget er foreløpig begrenset til ${metrics.length} innlegg. Dette er en tidlig indikasjon, ikke en sikker konklusjon.`
      : null,
  };
}
