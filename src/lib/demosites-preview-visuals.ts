export type DemoSitesPreviewIndustryVariant =
  | "auto"
  | "hospitality"
  | "clean"
  | "trade"
  | "clinic"
  | "professional"
  | "stay"
  | "property"
  | "logistics"
  | "neon"
  | "local";

export type DemoSitesPreviewIndustryVisual = {
  variant: DemoSitesPreviewIndustryVariant;
  label: string;
  heroPanelTitle: string;
  heroPanelText: string;
  signalTitle: string;
  signalText: string;
  signalItems: string[];
  panelStages: string[];
};

function normalizedSlug(templateSlug: string) {
  return templateSlug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isDemoSiteTechnologyTemplate(templateSlug: string) {
  const slug = normalizedSlug(templateSlug);
  if (slug === "ai" || slug.startsWith("ai-")) return true;
  return ["ai-teknologi", "teknologi", "teknobedrift", "tech", "software", "saas", "automasjon"].some((keyword) =>
    slug.includes(keyword),
  );
}

export function getDemoSitePreviewIndustryVisual(templateSlug: string): DemoSitesPreviewIndustryVisual {
  const slug = normalizedSlug(templateSlug);

  if (isDemoSiteTechnologyTemplate(slug)) {
    return {
      variant: "neon",
      label: "AI og teknologi",
      heroPanelTitle: "AI-pilot klar for beslutning",
      heroPanelText: "Vis workshop, dataflyt, integrasjoner og pilotløp som konkrete steg en leder kan forstå og godkjenne.",
      signalTitle: "Moderne AI-flyt uten buzzword-støy",
      signalText: "Demoen bør gjøre ny teknologi håndfast: hva som automatiseres, hva som må kobles på, og hvordan effekt måles.",
      signalItems: ["AI-workshop", "Datagrunnlag", "Integrasjoner"],
      panelStages: ["Strategi", "Dataflyt", "Integrasjoner", "Pilot"],
    };
  }

  if (slug.includes("dekk") || slug.includes("bilverksted")) {
    return {
      variant: "auto",
      label: "Dekk og verksted",
      heroPanelTitle: "Sesongklar verkstedflyt",
      heroPanelText: "Kunden skal raskt forstå dekkvalg, hjulhotell, verkstedtime og hvordan de ber om et presist tilbud.",
      signalTitle: "Bygget for timebestilling og tilbud",
      signalText: "Vis de viktigste bil- og dekktjenestene som praktiske valg, med tydelig vei videre til kontakt.",
      signalItems: ["Dekkskift", "Hjulhotell", "Verkstedtime"],
      panelStages: ["Behov", "Dekkvalg", "Time", "Oppfølging"],
    };
  }

  if (slug.includes("restaurant") || slug.includes("kafe") || slug.includes("cafe")) {
    return {
      variant: "hospitality",
      label: "Restaurant og kafé",
      heroPanelTitle: "Gjesteflyt fra meny til bord",
      heroPanelText: "Mat, atmosfære, meny og booking må vises tidlig, slik at gjesten får lyst til å ta neste steg.",
      signalTitle: "Vis meny, stemning og reservasjon samlet",
      signalText: "Demoen bør føles som et sted gjesten kan besøke, ikke bare en liste med tjenester.",
      signalItems: ["Meny", "Bordbooking", "Selskap"],
      panelStages: ["Stemning", "Meny", "Booking", "Besøk"],
    };
  }

  if (slug.includes("renhold")) {
    return {
      variant: "clean",
      label: "Renhold",
      heroPanelTitle: "Rent førsteinntrykk og enkel befaring",
      heroPanelText: "Kunden skal se kvalitet, avtaleform og hvordan de kan be om befaring uten friksjon.",
      signalTitle: "Profesjonelt renhold forklart enkelt",
      signalText: "Løft faste avtaler, privat/bedrift og tydelig pristilbud med en rolig, ryddig visuell profil.",
      signalItems: ["Befaring", "Fast avtale", "Kvalitet"],
      panelStages: ["Behov", "Areal", "Frekvens", "Tilbud"],
    };
  }

  if (slug.includes("elektro") || slug.includes("rorlegger") || slug.includes("snekker") || slug.includes("bygg")) {
    return {
      variant: "trade",
      label: "Fagbedrift",
      heroPanelTitle: "Fra prosjektbehov til befaring",
      heroPanelText: "Tjenester, prosess og dokumentasjon må gi trygghet før kunden ber om tilbud.",
      signalTitle: "Vis fagkompetanse med tydelig neste steg",
      signalText: "Demoen bør hjelpe kunden å beskrive jobben og forstå hvordan befaring, pris og oppstart fungerer.",
      signalItems: ["Befaring", "Prosjekt", "Dokumentasjon"],
      panelStages: ["Behov", "Befaring", "Tilbud", "Utførelse"],
    };
  }

  if (slug.includes("tannlege") || slug.includes("fysioterapi") || slug.includes("klinikk") || slug.includes("frisor") || slug.includes("skjonnhet")) {
    return {
      variant: "clinic",
      label: "Klinikk og behandling",
      heroPanelTitle: "Trygg vei til timebestilling",
      heroPanelText: "Behandlinger, pris og praktisk informasjon bør føles rolig, ryddig og enkelt å handle på.",
      signalTitle: "Pasient- og kundereisen først",
      signalText: "Gjør behandlinger, oppfølging og timebestilling tydelig uten å overlesse siden.",
      signalItems: ["Behandling", "Pris", "Time"],
      panelStages: ["Behov", "Behandling", "Time", "Oppfølging"],
    };
  }

  if (slug.includes("advokat")) {
    return {
      variant: "professional",
      label: "Juridisk rådgivning",
      heroPanelTitle: "Diskret og trygg første henvendelse",
      heroPanelText: "Fagområder, prosess og kontakt må virke profesjonelt uten å gjøre terskelen høy.",
      signalTitle: "Ryddig juridisk inngang",
      signalText: "Demoen bør forklare fagområdene og gjøre det lett å sende en relevant, kontrollert henvendelse.",
      signalItems: ["Fagområde", "Saksvurdering", "Kontakt"],
      panelStages: ["Spørsmål", "Vurdering", "Råd", "Oppfølging"],
    };
  }

  if (slug.includes("hotell") || slug.includes("overnatting")) {
    return {
      variant: "stay",
      label: "Hotell og overnatting",
      heroPanelTitle: "Fra inspirasjon til booking",
      heroPanelText: "Rom, fasiliteter og nærområde bør vises med en rolig kjøpsflyt som gjør oppholdet lett å velge.",
      signalTitle: "Oppholdet må føles konkret før booking",
      signalText: "La bilder, romvalg og praktisk informasjon bygge trygghet før gjesten sender forespørsel.",
      signalItems: ["Rom", "Fasiliteter", "Booking"],
      panelStages: ["Opphold", "Romvalg", "Tilgjengelighet", "Booking"],
    };
  }

  if (slug.includes("eiendomsmegler")) {
    return {
      variant: "property",
      label: "Eiendom",
      heroPanelTitle: "Verdivurdering med lokalt preg",
      heroPanelText: "Selgere må raskt se lokalkunnskap, rådgivning og hvordan de bestiller verdivurdering.",
      signalTitle: "Fra boligspørsmål til riktig meglerkontakt",
      signalText: "Demoen bør løfte tillit, områdekunnskap og en tydelig vei til vurdering.",
      signalItems: ["Verdivurdering", "Lokalkunnskap", "Salgsløp"],
      panelStages: ["Boliginfo", "Vurdering", "Plan", "Salg"],
    };
  }

  if (slug.includes("frakt") || slug.includes("transport") || slug.includes("logistikk")) {
    return {
      variant: "logistics",
      label: "Transport og logistikk",
      heroPanelTitle: "Leveringsflyt som er lett å bestille",
      heroPanelText: "Kunden må forstå område, oppdragstype og hvordan de får pris eller booking raskt.",
      signalTitle: "Fra oppdrag til transportavtale",
      signalText: "Vis levering, kapasitet og kontaktvei som konkrete valg i stedet for generisk firmatekst.",
      signalItems: ["Henting", "Levering", "Prisforespørsel"],
      panelStages: ["Oppdrag", "Rute", "Pris", "Levering"],
    };
  }

  return {
    variant: "local",
    label: "Lokal bedrift",
    heroPanelTitle: "Klar for riktige henvendelser",
    heroPanelText: "Tjenester, pakker og kontakt bør presenteres tydelig nok til at kunden vet hva neste steg er.",
    signalTitle: "Moderne standardmal for lokal business",
    signalText: "Når bransjen ikke er valgt, holder demoen uttrykket nøytralt og profesjonelt uten å late som den er en annen bransje.",
    signalItems: ["Tjenester", "Tilbud", "Kontakt"],
    panelStages: ["Behov", "Valg", "Forespørsel", "Oppfølging"],
  };
}
