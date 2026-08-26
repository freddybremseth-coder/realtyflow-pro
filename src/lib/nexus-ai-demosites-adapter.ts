import { buildNexusBusinessOpportunity, type NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";

export interface DemoSiteOrderInput {
  id: string;
  status?: string | null;
  billing_status?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  company_name?: string | null;
  package_id?: string | null;
  setup_fee_nok?: number | null;
  monthly_fee_nok?: number | null;
  currency?: string | null;
  preview_url?: string | null;
  claim_url?: string | null;
  expires_at?: string | null;
  claimed_at?: string | null;
  approved_at?: string | null;
  deployed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DemoSiteEventInput {
  id?: string | null;
  order_id: string;
  event_type: string;
  title?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function eventsForOrder(orderId: string, events: DemoSiteEventInput[]) {
  return events.filter((event) => String(event.order_id) === String(orderId));
}

function hasEvent(events: DemoSiteEventInput[], type: string) {
  return events.some((event) => normalize(event.event_type) === type);
}

function stageFor(order: DemoSiteOrderInput, events: DemoSiteEventInput[]) {
  const status = normalize(order.status);
  const billing = normalize(order.billing_status);

  if (billing === "paid" || status === "deployed" || hasEvent(events, "payment_paid")) return "won";
  if (billing === "pending" || status === "approved" || hasEvent(events, "demo_checkout_started") || hasEvent(events, "demo_claimed")) return "proposal_or_pilot";
  if (["draft_preview", "preview_ready"].includes(status)) return "demo_or_solution";
  if (status === "in_setup") return "qualified";
  return "new_lead";
}

function priorityScoreFor(order: DemoSiteOrderInput, events: DemoSiteEventInput[], stageId: string) {
  let score = 45;
  if (stageId === "qualified") score = 58;
  if (stageId === "demo_or_solution") score = 70;
  if (stageId === "proposal_or_pilot") score = 86;
  if (stageId === "won") score = 78;

  if (hasEvent(events, "demo_inquiry")) score += 14;
  if (hasEvent(events, "demo_claimed")) score += 7;
  if (hasEvent(events, "demo_checkout_started")) score += 8;
  if (normalize(order.billing_status) === "overdue") score += 6;

  if (order.expires_at && stageId !== "won") {
    const hours = (new Date(order.expires_at).getTime() - Date.now()) / 3_600_000;
    if (Number.isFinite(hours) && hours > 0 && hours <= 36) score += 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function reasonFor(order: DemoSiteOrderInput, events: DemoSiteEventInput[], stageId: string) {
  const signals: string[] = [];
  if (hasEvent(events, "demo_inquiry")) signals.push("demoen har generert en ekte kundehenvendelse");
  if (hasEvent(events, "demo_claimed")) signals.push("kunden har claimet demoen");
  if (hasEvent(events, "demo_checkout_started")) signals.push("kunden har startet checkout");
  if (hasEvent(events, "payment_paid") || normalize(order.billing_status) === "paid") signals.push("betaling er bekreftet");

  if (signals.length) return signals.join(" · ");
  if (stageId === "demo_or_solution") return "En fungerende demo er tilgjengelig og bør brukes som konkret beslutningsgrunnlag.";
  if (stageId === "qualified") return "Saken er i setup og har nok struktur til å behandles som en kvalifisert AI/SaaS-mulighet.";
  if (stageId === "proposal_or_pilot") return "Kunden har beveget seg fra demo mot claim/betaling og bør håndteres som en closing-mulighet.";
  if (stageId === "won") return "Betaling/deployment bekrefter vunnet kunde; fokus flyttes til levering og retention.";
  return "DemoSites CRM har en aktiv henvendelse/order som bør kvalifiseres videre.";
}

function nextActionFor(order: DemoSiteOrderInput, events: DemoSiteEventInput[], stageId: string) {
  if (stageId === "won") return "Sikre onboarding, publisering, domene/oppsett og tidlig verdi; følg deretter bruk, retention og relevant utvidelse.";
  if (stageId === "proposal_or_pilot") {
    if (hasEvent(events, "demo_checkout_started")) return "Closer: følg opp checkout-friksjon eller spørsmål og gjør neste beslutningssteg helt tydelig — uten å duplisere den automatiske follow-upen.";
    if (hasEvent(events, "demo_claimed")) return "Closer: bekreft behov, pakke og siste beslutningshinder og hjelp kunden trygt videre mot checkout.";
    return "Closer: avklar siste beslutningshinder, verdi, pakke og konkret dato for kjøpsbeslutning.";
  }
  if (stageId === "demo_or_solution") {
    if (hasEvent(events, "demo_inquiry")) return "Kontakt kunden personlig mens beviset er ferskt: demoen skaper allerede leads. Avklar beslutningstaker og neste steg mot kjøp.";
    return "Følg opp demoen med ett konkret use case, dokumentert verdi og en tydelig claim/checkout-vei.";
  }
  if (stageId === "qualified") return "Fullfør demo/use-case, bekreft beslutningstaker og gjør verdien konkret nok til en løsning/demo-gjennomgang.";
  return "Kvalifiser behov, beslutningstaker, dagens nettside/arbeidsflyt og hvilket resultat kunden vil kjøpe.";
}

export function demoSiteOrderToAiOpportunity(
  order: DemoSiteOrderInput,
  allEvents: DemoSiteEventInput[] = [],
): NexusBusinessOpportunity | null {
  const events = eventsForOrder(order.id, allEvents);
  const stageId = stageFor(order, events);
  const recurring = Number(order.monthly_fee_nok || 0);
  const setup = Number(order.setup_fee_nok || 0);
  const expectedValue = stageId === "won" || stageId === "proposal_or_pilot" ? setup + recurring : recurring || setup || null;

  return buildNexusBusinessOpportunity({
    id: `demosites:${order.id}`,
    brandId: "chatgenius",
    offerId: order.package_id || "demosites",
    pipelineId: "ai_products_services",
    stageId,
    title: `${order.company_name || order.customer_name || "DemoSites prospect"} · DemoSites`,
    reason: reasonFor(order, events, stageId),
    nextAction: nextActionFor(order, events, stageId),
    priorityScore: priorityScoreFor(order, events, stageId),
    value: Number.isFinite(expectedValue as number) ? expectedValue : null,
    currency: order.currency || "NOK",
    sourceSystem: "chatgenius_demosites",
    sourceId: order.id,
    href: "/saas?tab=demosites",
    routeConfidence: "high",
    routeReason: "DemoSites CRM er en eksplisitt ChatGenius AI/SaaS-salgskilde.",
    updatedAt: order.updated_at || order.approved_at || order.deployed_at || order.created_at || null,
  });
}

export function demoSiteOrdersToAiOpportunities(orders: DemoSiteOrderInput[], events: DemoSiteEventInput[] = []) {
  return orders
    .filter((order) => !["cancelled", "expired"].includes(normalize(order.status)))
    .map((order) => demoSiteOrderToAiOpportunity(order, events))
    .filter((item): item is NexusBusinessOpportunity => Boolean(item));
}
