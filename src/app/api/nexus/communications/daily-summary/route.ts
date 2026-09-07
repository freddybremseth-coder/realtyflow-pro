import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCustomerMemory, shouldAvoidProperty } from "@/lib/nexus-customer-memory";
import { scorePropertyV2 } from "@/lib/nexus-property-match-v2";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function priorityScore(row: any) {
  const urgency = String(row.ai_urgency || "").toLowerCase();
  let score = urgency === "critical" ? 100 : urgency === "high" ? 80 : urgency === "medium" ? 50 : 30;
  if (!row.replied_at) score += 30;
  if (!row.is_read) score += 15;
  const minutes = ageMinutes(row.received_at || row.created_at) ?? 0;
  if (minutes <= 30) score += 20;
  else if (minutes <= 120) score += 10;
  return score;
}

function portalBoost(input: { lastLoginMinutes: number | null; interested24h: number; messages24h: number }) {
  let boost = 0;
  const reasons: string[] = [];
  if (input.lastLoginMinutes != null) {
    if (input.lastLoginMinutes <= 30) {
      boost += 20;
      reasons.push("Min side brukt siste 30 min");
    } else if (input.lastLoginMinutes <= 120) {
      boost += 12;
      reasons.push("Min side brukt siste 2 timer");
    } else if (input.lastLoginMinutes <= 24 * 60) {
      boost += 5;
      reasons.push("Min side brukt siste 24 timer");
    }
  }
  if (input.interested24h > 0) {
    boost += Math.min(20, input.interested24h * 10);
    reasons.push(`${input.interested24h} bolig${input.interested24h === 1 ? "" : "er"} markert interessant siste 24t`);
  }
  if (input.messages24h > 0) {
    boost += Math.min(20, input.messages24h * 10);
    reasons.push(`${input.messages24h} melding${input.messages24h === 1 ? "" : "er"} sendt fra Min side siste 24t`);
  }
  return { boost: Math.min(30, boost), reasons };
}

function hotLeadScore(row: any, matchedCount: number, memoryEvidence: number, portalSignal = 0) {
  const text = `${row.subject || ""} ${row.ai_summary || ""} ${row.ai_suggested_action || ""}`.toLowerCase();
  const intent = String(row.ai_intent || "").toLowerCase();
  const urgency = String(row.ai_urgency || "").toLowerCase();
  let score = 25;
  if (intent === "viewing_request") score += 30;
  else if (intent === "offer") score += 35;
  else if (intent === "inquiry") score += 12;
  else if (intent === "follow_up") score += 10;
  if (urgency === "critical") score += 25;
  else if (urgency === "high") score += 20;
  else if (urgency === "medium") score += 8;
  const minutes = ageMinutes(row.received_at || row.created_at) ?? 9999;
  if (minutes <= 15) score += 18;
  else if (minutes <= 60) score += 12;
  else if (minutes <= 180) score += 6;
  if (/\b(viewing|visning|visningstur|appointment|cita|ver la vivienda)\b/i.test(text)) score += 14;
  if (/\b(offer|bud|motbud|price|pris|financing|finansiering|mortgage|hipoteca)\b/i.test(text)) score += 12;
  if (/\b(next week|this week|tomorrow|i morgen|neste uke|esta semana|mañana)\b/i.test(text)) score += 10;
  if (/\b(available|availability|ledig|tilgjengelig|disponible)\b/i.test(text)) score += 8;
  if (matchedCount > 0) score += Math.min(10, matchedCount * 3);
  if (memoryEvidence >= 3) score += 4;
  score += portalSignal;
  return Math.max(0, Math.min(100, score));
}

function nextBestQuestion(row: any, matchedCount: number, knownText = "") {
  const text = `${row.subject || ""} ${row.ai_summary || ""} ${knownText}`.toLowerCase();
  if (/\b(viewing|visning|appointment|cita)\b/i.test(text) && !/\b(date|dato|day|dag|week|uke|fecha|día)\b/i.test(text)) return "Hvilken dag og hvilket tidspunkt passer best for visning?";
  if (/\b(price|pris|budget|budsjett|precio)\b/i.test(text) && !/\b(financing|finansiering|mortgage|hipoteca|cash|kontant)\b/i.test(text)) return "Har dere finansiering på plass, og hvilket totalbudsjett ønsker dere å holde dere innenfor?";
  if (matchedCount === 0 && !/\b(altea|benidorm|finestrat|villajoyosa|albir|la nucia|polop|denia|moraira|calpe|quesada|torrevieja|pinoso|biar)\b/i.test(text)) return "Hvilke områder ønsker dere først og fremst å bo i?";
  if (!/\b(bedroom|soverom|dormitorio|habitaci[oó]n)\b/i.test(text)) return "Hvor mange soverom er minimum for dere?";
  if (!/\b(holiday|feriebolig|permanent|fast bolig|investment|investering|inversi[oó]n)\b/i.test(text)) return "Skal boligen hovedsakelig brukes som feriebolig, fast bolig eller investering?";
  return null;
}

function hotLabel(score: number) {
  if (score >= 85) return "HOT";
  if (score >= 70) return "WARM";
  if (score >= 50) return "ACTIVE";
  return "NORMAL";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const historySince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [outboundR, inboundR, contacts24R, draftsR] = await Promise.all([
    supabase.from("email_messages").select("id,brand_id,to_addresses,subject,created_at,received_at", { count: "exact" }).eq("direction", "outbound").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    supabase.from("email_messages").select("id,brand_id,from_address,from_name,subject,ai_summary,ai_intent,ai_urgency,ai_suggested_action,is_read,replied_at,received_at,created_at,matched_property_ids,crm_reply_classification,crm_contact_id").eq("direction", "inbound").gte("received_at", since).order("received_at", { ascending: false }).limit(500),
    supabase.from("contacts").select("id,name,email,pipeline_status,email_suppressed,do_not_contact,last_inbound_reply_at,last_reply_classification").gte("last_inbound_reply_at", since).limit(500),
    supabase.from("email_drafts").select("id,email_message_id,subject,body_text,ai_confidence,status,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);

  for (const result of [outboundR, inboundR, contacts24R, draftsR]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const inbound = inboundR.data ?? [];
  const contacts24 = contacts24R.data ?? [];
  const drafts = draftsR.data ?? [];
  const contactIds = Array.from(new Set(inbound.map((row: any) => String(row.crm_contact_id || "")).filter(Boolean)));

  const [contactDetailsR, historyR, feedbackR, portalR, portalMessagesR] = contactIds.length ? await Promise.all([
    supabase.from("contacts").select("id,name,email,notes,interactions,pipeline_status").in("id", contactIds).limit(500),
    supabase.from("email_messages").select("id,crm_contact_id,direction,subject,ai_summary,received_at,created_at").eq("direction", "inbound").in("crm_contact_id", contactIds).gte("received_at", historySince).order("received_at", { ascending: false }).limit(1000),
    supabase.from("property_feedback_events").select("contact_id,property_id,action,created_at").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(1000),
    supabase.from("portal_users").select("contact_id,status,invited_at,last_login_at").in("contact_id", contactIds).limit(500),
    supabase.from("portal_messages").select("contact_id,sender_type,created_at").in("contact_id", contactIds).gte("created_at", since).limit(1000),
  ]) : [
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
  ];

  if (contactDetailsR.error) return NextResponse.json({ error: contactDetailsR.error.message }, { status: 500 });
  if (historyR.error) return NextResponse.json({ error: historyR.error.message }, { status: 500 });
  const feedbackTableMissing = Boolean(feedbackR.error && /relation .*property_feedback_events.* does not exist|schema cache/i.test(String(feedbackR.error.message || "")));
  if (feedbackR.error && !feedbackTableMissing) return NextResponse.json({ error: feedbackR.error.message }, { status: 500 });
  const portalTableMissing = Boolean(portalR.error && /relation .*portal_users.* does not exist|schema cache/i.test(String(portalR.error.message || "")));
  if (portalR.error && !portalTableMissing) return NextResponse.json({ error: portalR.error.message }, { status: 500 });
  const portalMessagesMissing = Boolean(portalMessagesR.error && /relation .*portal_messages.* does not exist|schema cache/i.test(String(portalMessagesR.error.message || "")));
  if (portalMessagesR.error && !portalMessagesMissing) return NextResponse.json({ error: portalMessagesR.error.message }, { status: 500 });

  const contactById = new Map((contactDetailsR.data ?? []).map((row: any) => [String(row.id), row]));
  const historyByContact = new Map<string, any[]>();
  for (const row of (historyR.data ?? []) as any[]) {
    const key = String(row.crm_contact_id || "");
    if (!key) continue;
    const list = historyByContact.get(key) || [];
    if (list.length < 8) list.push(row);
    historyByContact.set(key, list);
  }
  const feedbackByContact = new Map<string, any[]>();
  for (const row of ((feedbackTableMissing ? [] : feedbackR.data) ?? []) as any[]) {
    const key = String(row.contact_id || "");
    if (!key) continue;
    const list = feedbackByContact.get(key) || [];
    list.push(row);
    feedbackByContact.set(key, list);
  }
  const portalByContact = new Map(((portalTableMissing ? [] : portalR.data) ?? []).map((row: any) => [String(row.contact_id), row]));
  const portalMessagesByContact = new Map<string, any[]>();
  for (const row of ((portalMessagesMissing ? [] : portalMessagesR.data) ?? []) as any[]) {
    const key = String(row.contact_id || "");
    if (!key) continue;
    const list = portalMessagesByContact.get(key) || [];
    list.push(row);
    portalMessagesByContact.set(key, list);
  }

  const draftByMessage = new Map<string, any>();
  for (const draft of drafts as any[]) if (draft.email_message_id && !draftByMessage.has(String(draft.email_message_id))) draftByMessage.set(String(draft.email_message_id), draft);

  const matchedPropertyIds = inbound.flatMap((row: any) => Array.isArray(row.matched_property_ids) ? row.matched_property_ids.map(String) : []);
  const feedbackPropertyIds = Array.from(feedbackByContact.values()).flatMap((rows) => rows.map((row: any) => String(row.property_id || "")).filter(Boolean));
  const propertyIds = Array.from(new Set([...matchedPropertyIds, ...feedbackPropertyIds]));
  const { data: properties, error: propertiesError } = propertyIds.length
    ? await supabase.from("properties").select("id,ref,price,location,bedrooms,bathrooms,title_no,title_en,title_es,primary_image").in("id", propertyIds).limit(500)
    : { data: [] as any[], error: null };
  if (propertiesError) return NextResponse.json({ error: propertiesError.message }, { status: 500 });
  const propertyById = new Map((properties ?? []).map((property: any) => [String(property.id), property]));

  const actionableAll = inbound
    .filter((row: any) => !["unsubscribe", "purchased", "informational"].includes(String(row.crm_reply_classification || "")))
    .filter((row: any) => !row.replied_at)
    .map((row: any) => {
      const contactId = String(row.crm_contact_id || "");
      const contact = contactById.get(contactId) || null;
      const feedback = feedbackByContact.get(contactId) || [];
      const history = historyByContact.get(contactId) || [];
      const memory = buildCustomerMemory({ notes: contact?.notes, interactions: contact?.interactions, recentConversation: history, feedback, propertiesById: propertyById });
      const draft = draftByMessage.get(String(row.id)) ?? null;
      const conversationText = [row.subject, row.ai_summary, row.ai_suggested_action, ...history.flatMap((item: any) => [item.subject, item.ai_summary]), ...memory.known].filter(Boolean).join(" ");
      const matchedProperties = (Array.isArray(row.matched_property_ids) ? row.matched_property_ids : [])
        .map((id: unknown) => propertyById.get(String(id)))
        .filter(Boolean)
        .filter((property: any) => !shouldAvoidProperty(String(property.id), feedback))
        .map((property: any) => ({ property, match: scorePropertyV2({ property, feedback, propertiesById: propertyById, conversationText, aiMatched: true }) }))
        .sort((a: any, b: any) => b.match.score - a.match.score)
        .slice(0, 5);

      const portal = portalByContact.get(contactId) || null;
      const lastLoginMinutes = ageMinutes(portal?.last_login_at);
      const interested24h = feedback.filter((item: any) => item.action === "interested" && String(item.created_at || "") >= since).length;
      const customerMessages24h = (portalMessagesByContact.get(contactId) || []).filter((item: any) => item.sender_type === "customer").length;
      const portalSignal = portalBoost({ lastLoginMinutes, interested24h, messages24h: customerMessages24h });
      const hotScore = hotLeadScore(row, matchedProperties.length, memory.evidenceCount, portalSignal.boost);
      const knownText = [...memory.known, ...memory.avoid].join(" ");
      return {
        messageId: row.id,
        brandId: row.brand_id,
        contactId: contactId || null,
        from: { name: row.from_name || contact?.name, email: row.from_address },
        subject: row.subject,
        summary: row.ai_summary,
        intent: row.ai_intent,
        urgency: row.ai_urgency,
        suggestedAction: row.ai_suggested_action,
        receivedAt: row.received_at || row.created_at,
        ageMinutes: ageMinutes(row.received_at || row.created_at),
        priorityScore: priorityScore(row),
        hotLeadScore: hotScore,
        hotLeadLabel: hotLabel(hotScore),
        portal: portal ? {
          status: portal.status,
          invitedAt: portal.invited_at,
          lastLoginAt: portal.last_login_at,
          lastLoginMinutes,
          interested24h,
          customerMessages24h,
          priorityBoost: portalSignal.boost,
          reasons: portalSignal.reasons,
        } : null,
        nextBestQuestion: nextBestQuestion(row, matchedProperties.length, knownText),
        customerMemory: memory,
        draft: draft ? { id: draft.id, subject: draft.subject, bodyText: draft.body_text, confidence: draft.ai_confidence, status: draft.status } : null,
        suggestedProperties: matchedProperties.map(({ property, match }: any) => ({
          id: property.id,
          ref: property.ref,
          title: property.title_no || property.title_en || property.title_es,
          price: property.price,
          location: property.location,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          primaryImage: property.primary_image,
          matchScore: match.score,
          matchLabel: match.label,
          matchReasons: match.reasons,
          matchCautions: match.cautions,
          learningConfidence: match.profile.confidence,
          matchReason: match.reasons[0] || "Aktuell AI-match; utilstrekkelig historikk for sterkere konklusjon",
        })),
      };
    })
    .sort((a: any, b: any) => b.hotLeadScore - a.hotLeadScore || b.priorityScore - a.priorityScore || Number(a.ageMinutes || 0) - Number(b.ageMinutes || 0));

  const importantReplies = actionableAll.slice(0, 12);
  const classifications = contacts24.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.last_reply_classification || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowHours: 24,
    memoryWindowDays: 90,
    propertyMatchVersion: 2,
    portalPriorityVersion: 1,
    summary: {
      sent: outboundR.count ?? (outboundR.data ?? []).length,
      inboundReplies: inbound.length,
      actionableUnanswered: actionableAll.length,
      hotLeads: actionableAll.filter((row: any) => row.hotLeadScore >= 85).length,
      slaAtRisk: actionableAll.filter((row: any) => Number(row.ageMinutes || 0) >= (String(row.urgency || "").toLowerCase() === "high" || String(row.urgency || "").toLowerCase() === "critical" ? 15 : String(row.urgency || "").toLowerCase() === "medium" ? 30 : 60)).length,
      portalActive2h: actionableAll.filter((row: any) => row.portal?.lastLoginMinutes != null && row.portal.lastLoginMinutes <= 120).length,
      portalInterested24h: actionableAll.reduce((sum: number, row: any) => sum + Number(row.portal?.interested24h || 0), 0),
      portalMessages24h: actionableAll.reduce((sum: number, row: any) => sum + Number(row.portal?.customerMessages24h || 0), 0),
      purchasedLost: classifications.purchased || 0,
      unsubscribed: classifications.unsubscribe || 0,
      suppressedContacts: contacts24.filter((row: any) => row.email_suppressed || row.do_not_contact).length,
    },
    classifications,
    importantReplies,
    note: "Reply Command prioriterer nå med både e-postsignaler og dokumentert Min side-aktivitet. Portalboost er begrenset til 30 poeng og betyr nylig aktivitet, ikke sanntids presence. Next Best Property v2 bruker eksplisitte krav og interested/not_for_me som beslutningsstøtte.",
  });
}
