export type AdvisorMailMode =
  | "first_response"
  | "qualification"
  | "shortlist"
  | "property_alert"
  | "viewing_push"
  | "post_viewing"
  | "follow_up"
  | "reactivation";

export interface AdvisorMailAgent {
  name: string;
  title?: string | null;
  firm?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  bookingUrl?: string | null;
  credentialsLine?: string | null;
}

export interface AdvisorMailProperty {
  id: string;
  title: string;
  location?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  listingUrl?: string | null;
  matchScore?: number | null;
  matchReasons: string[];
  compromises?: string[];
  facts?: Record<string, string | number | boolean | null>;
  urgency?: {
    isNewListing?: boolean;
    daysOnMarket?: number | null;
    priceReduction?: number | null;
    offMarket?: boolean;
    otherBuyerInterest?: boolean;
  } | null;
}

export interface AdvisorMailCTA {
  primaryLabel: string;
  primaryUrl?: string | null;
  secondaryLabel?: string | null;
  secondaryUrl?: string | null;
  viewingSlots?: string[];
  offerVideoViewing?: boolean;
}

export interface AdvisorMailInput {
  mode: AdvisorMailMode;
  clientName: string;
  area?: string | null;
  subject: string;
  opening: string;
  agent: AdvisorMailAgent;
  properties?: AdvisorMailProperty[];
  cta: AdvisorMailCTA;
  trustText?: string | null;
  testimonial?: { quote: string; attribution?: string | null } | null;
  processSteps?: Array<{ title: string; text: string }>;
  videoUrl?: string | null;
  ps?: string | null;
  compliance?: {
    unsubscribeUrl?: string | null;
    commercialMessage?: boolean;
  };
}

export interface AdvisorMailRendered {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  metadata: {
    mode: AdvisorMailMode;
    propertyIds: string[];
    maxMatchScore: number | null;
    hasTruthBasedUrgency: boolean;
  };
}

const C = {
  paper: "#F6F3EC",
  white: "#FFFFFF",
  ink: "#15202B",
  sub: "#5C6672",
  line: "#E6E1D5",
  gold: "#A8792C",
  blueSoft: "#E9EFF2",
  green: "#5B6B4A",
  greenSoft: "#ECEFE6",
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function euro(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function hasTruthBasedUrgency(property: AdvisorMailProperty) {
  const u = property.urgency;
  if (!u) return false;
  return Boolean(
    u.isNewListing ||
      u.offMarket ||
      u.otherBuyerInterest ||
      (u.priceReduction != null && u.priceReduction > 0) ||
      (u.daysOnMarket != null && u.daysOnMarket <= 7)
  );
}

function renderPropertyHtml(property: AdvisorMailProperty, index: number) {
  const reasons = property.matchReasons
    .filter(Boolean)
    .map((reason) => `<li style="margin:0 0 5px 0;">${esc(reason)}</li>`)
    .join("");
  const compromises = (property.compromises || [])
    .filter(Boolean)
    .map((item) => `<li style="margin:0 0 5px 0;">${esc(item)}</li>`)
    .join("");

  const score = property.matchScore == null
    ? ""
    : `<span style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:${C.green};background:${C.greenSoft};border-radius:20px;padding:5px 9px;white-space:nowrap;">${Math.round(property.matchScore)} % match</span>`;

  const image = property.imageUrl
    ? `<tr><td style="padding:0;"><img src="${esc(property.imageUrl)}" alt="${esc(property.title)}" style="display:block;width:100%;height:auto;border-radius:8px 8px 0 0;" /></td></tr>`
    : "";

  const link = property.listingUrl
    ? `<tr><td style="padding:0 22px 20px 22px;"><a href="${esc(property.listingUrl)}" style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${C.ink};text-decoration:none;border-bottom:2px solid ${C.gold};padding-bottom:2px;">Se boligen →</a></td></tr>`
    : "";

  return `<tr><td style="padding:0 0 20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;background:${C.white};">
      ${image}
      <tr><td style="padding:18px 22px 4px 22px;">
        <div style="font-family:Georgia,serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.gold};padding-bottom:8px;">Bolig ${index + 1}${property.location ? ` · ${esc(property.location)}` : ""}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:Georgia,serif;font-size:19px;color:${C.ink};font-weight:bold;">${esc(property.title)}</td>
          <td align="right" style="padding-left:12px;vertical-align:top;">${score}</td>
        </tr></table>
        ${property.price != null ? `<div style="font-family:Georgia,serif;font-size:17px;color:${C.ink};padding-top:5px;">${esc(euro(property.price))}</div>` : ""}
      </td></tr>
      ${reasons ? `<tr><td style="padding:8px 22px 8px 22px;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#3d454f;"><strong style="color:${C.ink};">Hvorfor jeg valgte denne:</strong><ul style="margin:8px 0 0 18px;padding:0;">${reasons}</ul></td></tr>` : ""}
      ${compromises ? `<tr><td style="padding:4px 22px 14px 22px;font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:${C.sub};"><strong style="color:${C.ink};">Verdt å vite:</strong><ul style="margin:8px 0 0 18px;padding:0;">${compromises}</ul></td></tr>` : ""}
      ${link}
    </table>
  </td></tr>`;
}

function renderProcessHtml(steps: AdvisorMailInput["processSteps"]) {
  if (!steps?.length) return "";
  return `<tr><td style="padding:6px 0 22px 0;">
    <div style="font-family:Georgia,serif;font-size:15px;color:${C.ink};font-weight:bold;padding-bottom:12px;">Slik jobber jeg med dere</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:8px;background:${C.blueSoft};">
      <tr><td style="padding:18px 20px;">${steps
        .map(
          (step, index) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="34" valign="top" style="font-family:Georgia,serif;font-size:15px;color:${C.gold};font-weight:bold;padding-top:1px;">0${index + 1}</td>
            <td style="padding-bottom:${index < steps.length - 1 ? "14px" : "0"};">
              <div style="font-family:Georgia,serif;font-size:14px;color:${C.ink};font-weight:bold;">${esc(step.title)}</div>
              <div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#41505c;padding-top:2px;">${esc(step.text)}</div>
            </td>
          </tr></table>`
        )
        .join("")}</td></tr>
    </table>
  </td></tr>`;
}

export function renderAdvisorMail(input: AdvisorMailInput): AdvisorMailRendered {
  const properties = (input.properties || []).slice(0, 4);
  const propertyHtml = properties.map(renderPropertyHtml).join("");
  const processHtml = renderProcessHtml(input.processSteps);
  const videoHtml = input.videoUrl
    ? `<tr><td style="padding:0 0 20px 0;"><a href="${esc(input.videoUrl)}" style="display:block;font-family:Arial,sans-serif;font-size:14px;color:${C.ink};text-decoration:none;background:${C.blueSoft};border:1px solid #cfdde3;border-radius:6px;padding:12px 16px;">▶ Se min korte gjennomgang av utvalget</a></td></tr>`
    : "";
  const testimonialHtml = input.testimonial?.quote
    ? `<tr><td style="padding:0 0 22px 0;border-left:3px solid ${C.gold};"><div style="padding:6px 20px;font-family:Georgia,serif;font-style:italic;font-size:15px;line-height:1.6;color:#2b333d;">&ldquo;${esc(input.testimonial.quote)}&rdquo;${input.testimonial.attribution ? `<div style="font-family:Arial,sans-serif;font-size:12px;font-style:normal;color:${C.sub};padding-top:8px;">— ${esc(input.testimonial.attribution)}</div>` : ""}</div></td></tr>`
    : "";

  const slotText = input.cta.viewingSlots?.length
    ? ` Ledige tider: ${input.cta.viewingSlots.join(", ")}.`
    : "";
  const videoText = input.cta.offerVideoViewing
    ? " Vi kan også starte med videovisning hvis det passer bedre."
    : "";

  const ctaButtons = [
    input.cta.primaryUrl
      ? `<a href="${esc(input.cta.primaryUrl)}" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:700;border-radius:6px;padding:11px 16px;margin:0 8px 8px 0;">${esc(input.cta.primaryLabel)}</a>`
      : "",
    input.cta.secondaryLabel && input.cta.secondaryUrl
      ? `<a href="${esc(input.cta.secondaryUrl)}" style="display:inline-block;background:#fff;color:${C.ink};text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:700;border:1px solid ${C.line};border-radius:6px;padding:10px 15px;margin:0 0 8px 0;">${esc(input.cta.secondaryLabel)}</a>`
      : "",
  ].join("");

  const unsubscribe = input.compliance?.commercialMessage && input.compliance.unsubscribeUrl
    ? `<tr><td style="padding:16px 34px 24px 34px;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:${C.sub};border-top:1px solid ${C.line};">Dette er en oppfølging knyttet til din boliginteresse. <a href="${esc(input.compliance.unsubscribeUrl)}" style="color:${C.sub};">Stopp videre markedsføring</a>.</td></tr>`
    : "";

  const bodyHtml = `<div style="background:${C.paper};padding:24px 12px;font-family:Arial,sans-serif;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:${C.white};border:1px solid ${C.line};border-radius:8px;">
  <tr><td style="height:5px;background:${C.gold};border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:28px 34px 0 34px;"><div style="font-family:Georgia,serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${C.gold};">${esc(input.agent.title || "Boligrådgiver")}</div></td></tr>
  <tr><td style="padding:16px 34px 0 34px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#2b333d;"><p style="margin:0 0 16px 0;">Hei ${esc(input.clientName)},</p><p style="margin:0 0 22px 0;">${esc(input.opening)}</p></td></tr>
  <tr><td style="padding:0 34px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${videoHtml}${propertyHtml}${testimonialHtml}${processHtml}</table></td></tr>
  <tr><td style="padding:2px 34px 0 34px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#2b333d;"><p style="margin:0 0 14px 0;">${esc(input.cta.primaryLabel)}.${esc(slotText)}${esc(videoText)}</p>${ctaButtons}${input.trustText ? `<p style="margin:8px 0 22px 0;background:${C.greenSoft};border-left:3px solid ${C.green};padding:14px 16px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.65;">${esc(input.trustText)}</p>` : ""}</td></tr>
  <tr><td style="padding:6px 34px 26px 34px;border-top:1px solid ${C.line};font-family:Arial,sans-serif;"><div style="font-family:Georgia,serif;font-size:17px;color:${C.ink};font-weight:bold;padding-top:20px;">${esc(input.agent.name)}</div><div style="font-size:13px;color:${C.sub};padding-top:3px;">${esc([input.agent.title, input.agent.firm].filter(Boolean).join(" · "))}</div><div style="font-size:13px;color:#2b333d;padding-top:8px;line-height:1.7;">${[input.agent.phone && `Tlf: ${input.agent.phone}`, input.agent.whatsapp && `WhatsApp: ${input.agent.whatsapp}`, input.agent.email].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ")}</div>${input.agent.credentialsLine ? `<div style="font-size:11px;color:${C.sub};padding-top:10px;line-height:1.5;">${esc(input.agent.credentialsLine)}</div>` : ""}${input.ps ? `<div style="font-size:13px;color:${C.sub};padding-top:16px;line-height:1.6;"><strong style="color:${C.ink};">P.S.</strong> ${esc(input.ps)}</div>` : ""}</td></tr>
  ${unsubscribe}
</table></div>`;

  const text: string[] = [`Hei ${input.clientName},`, "", input.opening, ""];
  if (input.videoUrl) text.push(`Videogjennomgang: ${input.videoUrl}`, "");
  properties.forEach((property, index) => {
    text.push(`Bolig ${index + 1}: ${property.title}${property.location ? ` — ${property.location}` : ""}`);
    if (property.matchScore != null) text.push(`${Math.round(property.matchScore)} % match`);
    if (property.price != null) text.push(euro(property.price));
    property.matchReasons.forEach((reason) => text.push(`✓ ${reason}`));
    (property.compromises || []).forEach((item) => text.push(`△ ${item}`));
    if (property.listingUrl) text.push(`Se boligen: ${property.listingUrl}`);
    text.push("");
  });
  if (input.processSteps?.length) {
    text.push("Slik jobber jeg med dere:");
    input.processSteps.forEach((step, index) => text.push(`${index + 1}. ${step.title}: ${step.text}`));
    text.push("");
  }
  text.push(input.cta.primaryLabel + "." + slotText + videoText);
  if (input.cta.primaryUrl) text.push(input.cta.primaryUrl);
  if (input.cta.secondaryLabel && input.cta.secondaryUrl) text.push(`${input.cta.secondaryLabel}: ${input.cta.secondaryUrl}`);
  if (input.trustText) text.push("", input.trustText);
  text.push("", `— ${input.agent.name}`);
  if (input.agent.phone) text.push(`Tlf: ${input.agent.phone}`);
  if (input.agent.whatsapp) text.push(`WhatsApp: ${input.agent.whatsapp}`);
  if (input.agent.email) text.push(input.agent.email);
  if (input.ps) text.push("", `P.S. ${input.ps}`);
  if (input.compliance?.commercialMessage && input.compliance.unsubscribeUrl) text.push("", `Stopp videre markedsføring: ${input.compliance.unsubscribeUrl}`);

  return {
    subject: input.subject,
    bodyHtml,
    bodyText: text.join("\n"),
    metadata: {
      mode: input.mode,
      propertyIds: properties.map((property) => property.id),
      maxMatchScore: properties.length
        ? Math.max(...properties.map((property) => property.matchScore ?? 0)) || null
        : null,
      hasTruthBasedUrgency: properties.some(hasTruthBasedUrgency),
    },
  };
}
