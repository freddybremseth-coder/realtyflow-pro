import { BRANDS } from "@/lib/constants";

export type CustomerOutreachTemplateId =
  | "soft_reconnect"
  | "new_opportunity"
  | "market_update"
  | "criteria_refresh"
  | "short_call";

export type CustomerOutreachTemplate = {
  id: CustomerOutreachTemplateId;
  label: string;
  description: string;
  subject: string;
  body: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstName(value: unknown) {
  return text(value).split(/\s+/)[0] || "";
}

export function normalizeCustomerOutreachBrand(value: unknown) {
  const token = text(value).toLowerCase();
  if (["zeneco", "zenecohomes", "zen eco homes"].includes(token)) return "zeneco";
  if (["soleada", "soleada.no"].includes(token)) return "soleada";
  if (["pinosoecolife", "pinoso eco life", "pinoso ecolife"].includes(token)) return "pinosoecolife";
  return token;
}

export function customerOutreachBrand(value: unknown) {
  const id = normalizeCustomerOutreachBrand(value);
  return BRANDS.find((brand) => brand.id === id) || null;
}

export function buildCustomerOutreachTemplates(input: {
  contactName?: unknown;
  brandId?: unknown;
}): CustomerOutreachTemplate[] {
  const name = firstName(input.contactName);
  const greeting = name ? `Hei ${name},` : "Hei,";
  const brand = customerOutreachBrand(input.brandId);
  const website = brand?.website || "";
  const advisorLine = "Vennlig hilsen\nFreddy";
  const websiteLine = website ? `\n\n${website}` : "";

  return [
    {
      id: "soft_reconnect",
      label: "Myk reaktivering",
      description: "Kort og uforpliktende kontakt for å se om bolig i Spania fortsatt er interessant.",
      subject: "Er bolig i Spania fortsatt aktuelt?",
      body: [
        greeting,
        "",
        "Jeg ville bare sjekke inn kort. Det er en stund siden vi snakket om bolig i Spania, og jeg ønsker ikke å fylle innboksen din med ting som ikke er relevante.",
        "",
        "Er dette fortsatt noe du ønsker å følge med på, eller skal jeg la det ligge foreløpig?",
        "",
        advisorLine + websiteLine,
      ].join("\n"),
    },
    {
      id: "new_opportunity",
      label: "Ny mulighet",
      description: "Skap interesse rundt noe nytt uten å late som det er en perfekt match.",
      subject: "En boligmulighet jeg tenkte kunne være relevant",
      body: [
        greeting,
        "",
        "Jeg har sett en ny boligmulighet som fikk meg til å tenke på det vi tidligere har snakket om.",
        "",
        "Jeg vil ikke sende deg en lang liste, men kan gjerne plukke ut noen få alternativer og forklare hvorfor jeg mener de kan være relevante for deg.",
        "",
        "Si gjerne fra hvis du vil at jeg skal sende dem over.",
        "",
        advisorLine + websiteLine,
      ].join("\n"),
    },
    {
      id: "market_update",
      label: "Markedsoppdatering",
      description: "Ta kontakt med nyttig informasjon først, og la interessen komme som neste steg.",
      subject: "Kort oppdatering fra boligmarkedet på Costa Blanca",
      body: [
        greeting,
        "",
        "En liten oppdatering fra meg: det har kommet noen endringer og nye prosjekter i markedet som kan være verdt å kjenne til hvis du fortsatt følger med på bolig i Spania.",
        "",
        "Hvis du ønsker det, kan jeg sende deg en kort og konkret oppsummering tilpasset områdene og prisnivået som er mest relevant for deg.",
        "",
        advisorLine + websiteLine,
      ].join("\n"),
    },
    {
      id: "criteria_refresh",
      label: "Oppdater boligønsker",
      description: "Få kunden til å korrigere gamle kriterier før du sender flere boliger.",
      subject: "Har boligønskene dine endret seg?",
      body: [
        greeting,
        "",
        "Før jeg eventuelt sender deg nye boliger vil jeg heller være sikker på at jeg leter etter det som faktisk er riktig for deg nå.",
        "",
        "Har noe endret seg når det gjelder område, budsjett, boligtype eller når et kjøp kan være aktuelt?",
        "",
        "Et par linjer tilbake er nok, så kan jeg gjøre søket langt mer presist.",
        "",
        advisorLine + websiteLine,
      ].join("\n"),
    },
    {
      id: "short_call",
      label: "Foreslå kort prat",
      description: "Lav terskel for å gjenåpne dialogen uten et tungt salgspress.",
      subject: "Skal vi ta en kort prat?",
      body: [
        greeting,
        "",
        "Hvis bolig i Spania fortsatt er interessant, kan det være enklere å ta en kort prat enn å sende frem og tilbake mange e-poster.",
        "",
        "Vi kan bruke 10 minutter på hva som er aktuelt nå, så kan jeg etterpå bare sende det som faktisk er relevant.",
        "",
        "Si fra hvis det passer, så finner vi et tidspunkt.",
        "",
        advisorLine + websiteLine,
      ].join("\n"),
    },
  ];
}

export function customerOutreachTemplateById(
  id: CustomerOutreachTemplateId,
  input: { contactName?: unknown; brandId?: unknown },
) {
  return buildCustomerOutreachTemplates(input).find((template) => template.id === id) || null;
}
