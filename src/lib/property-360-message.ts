export interface Property360MessageProperty {
  title?: string | null;
  location?: string | null;
  price?: number | null;
  reference?: string | null;
}

export interface Property360MessageBuyer {
  contactName?: string | null;
  reason?: string | null;
  concerns?: string[] | null;
  questionsToVerify?: string[] | null;
}

function firstName(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.split(/\s+/)[0] : "der";
}

function formatPrice(value: number | null | undefined) {
  const price = Number(value || 0);
  if (!price) return null;
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

export function prepareProperty360Message(
  property: Property360MessageProperty,
  buyer: Property360MessageBuyer,
) {
  const greeting = `Hei ${firstName(buyer.contactName)},`;
  const propertyName = property.title || property.reference || "en bolig";
  const price = formatPrice(property.price);
  const facts = [property.location, price, property.reference ? `ref. ${property.reference}` : null]
    .filter(Boolean)
    .join(" · ");
  const reason = String(buyer.reason || "Boligen ser ut til å passe flere av kriteriene dine.").trim();
  const verification = (buyer.questionsToVerify || []).filter(Boolean).slice(0, 2);

  const lines = [
    greeting,
    "",
    `Jeg har sett på ${propertyName}, og jeg tror den kan være relevant for deg.`,
    facts ? `Nøkkelinfo: ${facts}.` : null,
    `Grunnen til at jeg trekker den frem er: ${reason}`,
    verification.length > 0
      ? `Det er fortsatt et par punkter jeg vil verifisere før vi konkluderer: ${verification.join("; ")}.`
      : null,
    "",
    "Hvis dette ser interessant ut, kan jeg sende deg mer informasjon eller gå gjennom boligen med deg.",
    "",
    "Vennlig hilsen",
    "Freddy",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
