import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function realEstateFields(areaOptions: string[]) {
  return [
    { type: "radio-grid", id: "propertyGoal", label: "Hva vurderer du?", options: ["Feriebolig", "Fast bolig", "Investering", "Nybygg", "Tomt", "Usikker"], required: true },
    { type: "select", id: "area", label: "Hvilket område vurderer du?", options: areaOptions, required: true },
    { type: "select", id: "budget", label: "Omtrentlig budsjett?", options: ["Under €200.000", "€200.000–€350.000", "€350.000–€500.000", "€500.000–€800.000", "Over €800.000"], required: true },
    { type: "select", id: "timing", label: "Når ønsker du å kjøpe?", options: ["Innen 3 måneder", "3–6 måneder", "6–12 måneder", "1–2 år", "Bare undersøker"], required: true },
    { type: "radio-grid", id: "financing", label: "Har du finansiering på plass?", options: ["Ja", "Delvis", "Nei", "Usikker"], required: true },
    { type: "checkbox-grid", id: "priorities", label: "Hva er viktigst for deg?", options: ["Utsikt", "Nærhet til sjø", "Rolige omgivelser", "Stor tomt", "Utleiemulighet", "Nybygg", "Gangavstand til fasiliteter", "Pris/verdi", "Investering"] },
    { type: "textarea", id: "note", label: "Skriv kort hva du ønsker hjelp med.", placeholder: "Fortell kort om ønsket bolig, område, budsjett eller hva du lurer på." },
  ];
}

function realEstateServices(prefix: string, iconStyle: string, areaOptions: string[], pinosoFocused = false) {
  return [
    {
      id: `${prefix}-first-call`,
      icon: "Phone",
      iconStyle,
      title: pinosoFocused ? "Første boligsamtale Pinoso" : "Første boligsamtale Spania",
      subtitle: pinosoFocused ? "For deg som vurderer bolig, tomt eller nybygg i innlandet" : "For deg som vurderer å kjøpe bolig i Spania",
      duration: 30,
      durationLabel: "30 min",
      price: "Gratis",
      priceNote: "uforpliktende",
      paid: false,
      format: "Google Meet / telefon",
      blurb: pinosoFocused
        ? "For deg som ønsker en uforpliktende prat om Pinoso-området, tomter, moderne villaer, budsjett og praktiske muligheter."
        : "For deg som ønsker en uforpliktende prat om boligkjøp i Spania, områder, budsjett og aktuelle muligheter.",
      cta: pinosoFocused ? "Book gratis Pinoso-samtale" : "Book gratis boligsamtale",
      intakeTitle: pinosoFocused ? "Hjelp oss forberede Pinoso-samtalen" : "Hjelp oss forberede boligsamtalen",
      intakeFields: realEstateFields(areaOptions),
    },
    {
      id: `${prefix}-plot-newbuild-villa`,
      icon: "Home",
      iconStyle,
      title: "Tomt, nybygg og moderne villa i innlandet",
      subtitle: "For deg som vurderer tomt, nybygg, villa eller større eiendom",
      duration: 30,
      durationLabel: "30 min",
      price: "Gratis",
      priceNote: "uforpliktende",
      paid: false,
      format: "Google Meet / telefon",
      blurb: "For deg som vurderer å bygge moderne bolig i Spania, kjøpe tomt eller ønsker større plass, ro, natur og mulighet for et mer selvstendig liv.",
      cta: "Book samtale om tomt og nybygg",
      intakeTitle: "Hjelp oss forberede samtalen",
      intakeFields: realEstateFields(areaOptions),
    },
    {
      id: `${prefix}-viewing-trip`,
      icon: "Calendar",
      iconStyle,
      title: "Visningsreise eller befaring i Spania",
      subtitle: "For deg som planlegger å reise til Spania",
      duration: 30,
      durationLabel: "30 min",
      price: "Gratis første avklaring",
      priceNote: "første avklaring",
      paid: false,
      format: "Telefon / video",
      blurb: "For deg som vurderer å komme til Spania for å se områder, prosjekter, tomter eller boliger, og ønsker hjelp til å planlegge en effektiv visningsreise.",
      cta: "Planlegg visningsreise",
      intakeTitle: "Hjelp oss planlegge visningsreisen",
      intakeFields: realEstateFields(areaOptions),
    },
  ];
}

function propertyAdviceFields() {
  return [
    { type: "checkbox-grid", id: "reviewType", label: "Hva ønsker du vurdert?", options: ["Bolig", "Leilighet", "Villa", "Tomt", "Nybyggprosjekt", "Utbygger", "Megler", "Kjøpsprosess", "Områdevalg"], required: true },
    { type: "radio-grid", id: "objectFound", label: "Har du allerede funnet et konkret objekt?", options: ["Ja", "Nei", "Flere alternativer"], required: true },
    { type: "url", id: "objectUrl", label: "Legg inn link til bolig/prosjekt hvis du har.", placeholder: "https://" },
    { type: "text", id: "spainArea", label: "Hvor i Spania gjelder dette?", placeholder: "F.eks. Pinoso, Torrevieja, Costa Blanca Nord..." },
    { type: "select", id: "processStage", label: "Hvor langt er du kommet i prosessen?", options: ["Bare vurderer", "Har dialog med megler", "Har sett bolig", "Vurderer reservasjon", "Har betalt depositum", "Skal signere kontrakt", "Usikker"], required: true },
    { type: "textarea", id: "uncertainty", label: "Hva er du mest usikker på?", placeholder: "Risiko, prisnivå, område, kontrakt, utbygger, prosess..." },
    { type: "textarea", id: "desiredOutcome", label: "Hva ønsker du å få ut av møtet?", placeholder: "Beskriv hva du vil sitte igjen med." },
  ];
}

function strategyFields() {
  return [
    { type: "checkbox-grid", id: "strategyNeeds", label: "Hva ønsker du hjelp med?", options: ["Strategi", "Salg", "AI", "Markedsføring", "Nettside", "Forretningsmodell", "Produkt/tjeneste", "Kundereise", "Skalering", "Annet"], required: true },
    { type: "text", id: "businessType", label: "Hva slags virksomhet driver du?", placeholder: "Kort om selskapet, prosjektet eller ideen." },
    { type: "url", id: "website", label: "Link til nettside hvis du har.", placeholder: "https://" },
    { type: "select", id: "stage", label: "Hvor er du i dag?", options: ["Idéstadiet", "Nyoppstartet", "Etablert bedrift", "Ønsker vekst", "Trenger ny retning", "Står fast"], required: true },
    { type: "textarea", id: "challenge", label: "Hva er den største utfordringen akkurat nå?", placeholder: "Hva stopper fremdrift, salg eller tydelig retning?" },
    { type: "textarea", id: "desiredOutcome", label: "Hva ønsker du å sitte igjen med etter møtet?", placeholder: "Konkrete beslutninger, prioriteringer, ideer, vurdering..." },
    { type: "textarea", id: "documents", label: "Har du konkrete dokumenter, nettsider eller tilbud du ønsker at jeg skal se på før møtet?", placeholder: "Lim inn lenker eller beskriv materialet." },
  ];
}

function aiFields() {
  return [
    { type: "text", id: "companyType", label: "Hva slags bedrift har du?", placeholder: "F.eks. eiendom, konsulent, håndverker, B2B, nettbutikk..." },
    { type: "checkbox-grid", id: "needs", label: "Hva ønsker du hjelp med?", options: ["Flere leads", "Bedre møtebooking", "Chatbot", "Automatisert oppfølging", "Kundeservice", "Salgsprosess", "Innholdsproduksjon", "CRM / systemflyt", "Vet ikke ennå"], required: true },
    { type: "radio-grid", id: "hasWebsite", label: "Har du nettside?", options: ["Ja", "Nei", "Under utvikling"], required: true },
    { type: "url", id: "website", label: "Link til nettside.", placeholder: "https://" },
    { type: "checkbox-grid", id: "customerChannels", label: "Hvordan får du kunder i dag?", options: ["Nettverk", "Annonser", "Telefon", "E-post", "Sosiale medier", "Google", "Anbefalinger", "Annet"] },
    { type: "radio-grid", id: "challenge", label: "Hva er største utfordring akkurat nå?", options: ["For få leads", "Dårlig oppfølging", "For mye manuelt arbeid", "Lav konvertering", "Lite tid", "Utydelig tilbud", "Vet ikke"], required: true },
    { type: "text", id: "crm", label: "Bruker du CRM eller e-postsystem i dag?", placeholder: "F.eks. HubSpot, Pipedrive, Mailchimp, ingen..." },
    { type: "textarea", id: "aiGoal", label: "Hva ønsker du at AI skal hjelpe deg med?", placeholder: "Beskriv prosessen, målet eller ideen du vil utforske." },
  ];
}

function knownBookingConfig(brandId: string) {
  const templates: Record<string, any> = {
    zeneco: {
      domain: "ZenEcoHomes.com",
      siteName: "ZenEcoHomes",
      bookingUrl: "zenecohomes.com/book",
      logoUrl: "https://realtyflow.chatgenius.pro/brand-logos/zeneco.png",
      accent: "leaf",
      profile: {
        name: "ZenEcoHomes",
        initials: "ZE",
        role: "Bolig i Spania",
        location: "Costa Blanca",
        tz: "Europa/Madrid (CET)",
        bio: "Jeg hjelper deg å finne og kjøpe riktig bolig i Spania.",
      },
      page: {
        eyebrow: "Bolig i Spania",
        title: "Book en samtale om bolig i Spania",
        lead: "Få en trygg og uforpliktende prat om områder, boligtyper, budsjett og muligheter på Costa Blanca.",
        intro: [
          "Drømmer du om bolig i Spania, men er usikker på hvor du bør starte?",
          "I en første samtale ser vi på hva du ønsker, hvilket område som kan passe, budsjett, tidshorisont og hvilken type bolig som gir mest mening for deg. Enten du vurderer feriebolig, fast bolig, investering, nybygg, villa, leilighet eller tomt, får du en praktisk og ærlig gjennomgang av mulighetene.",
          "Målet er at du skal få bedre oversikt og ta tryggere valg før du går videre.",
        ],
      },
      services: realEstateServices("zen", "leaf", ["Costa Blanca", "Costa Blanca Nord", "Costa Blanca Sør", "Altea / Albir / Benidorm", "Calpe / Jávea / Moraira", "Vet ikke ennå"]),
      crossLinks: [],
    },
    pinosoecolife: {
      domain: "PinosoEcoLife.com",
      siteName: "PinosoEcoLife",
      bookingUrl: "pinosoecolife.com/book",
      logoUrl: "",
      accent: "blue",
      profile: {
        name: "PinosoEcoLife",
        initials: "PE",
        role: "Bolig, tomt og nybygg i Pinoso-området",
        location: "Pinoso · Aspe · Novelda · Inland Costa Blanca",
        tz: "Europa/Madrid (CET)",
        bio: "Jeg hjelper deg å utforske bolig, tomt, nybygg og et roligere liv i innlandet av Costa Blanca.",
      },
      page: {
        eyebrow: "Bolig i Pinoso-området",
        title: "Book en samtale om bolig og liv i Pinoso",
        lead: "Få en trygg og uforpliktende prat om områder, tomter, nybygg, villaer og muligheter i innlandet av Costa Blanca.",
        intro: [
          "Vurderer du Pinoso, Aspe, Novelda eller innlandet av Costa Blanca, men er usikker på hvor du bør starte?",
          "I en første samtale ser vi på ønskene dine, budsjett, livsstil, boligtype, tomtemuligheter og hvilken prosess som passer best.",
          "Målet er at du skal få bedre oversikt før du reiser ned, booker visning eller går videre med tomt, nybygg eller bolig.",
        ],
      },
      services: realEstateServices("pinoso", "blue", ["Pinoso", "Aspe", "Novelda", "Hondón-dalen", "Innlandet Costa Blanca", "Vet ikke ennå"], true),
      crossLinks: [],
    },
    chatgenius: {
      domain: "ChatGenius.pro",
      siteName: "ChatGenius",
      bookingUrl: "chatgenius.pro/book",
      logoUrl: "",
      accent: "violet",
      profile: {
        name: "ChatGenius.pro",
        initials: "CG",
        role: "AI og salg for bedrifter",
        location: "Norge · Spania · Remote",
        tz: "Europa/Madrid (CET)",
        bio: "Jeg hjelper bedrifter å bruke AI for å få flere leads, bedre oppfølging og mer salg.",
      },
      page: {
        eyebrow: "AI og salg for bedrifter",
        title: "Book en AI- og salgssamtale for din bedrift",
        lead: "Se hvordan AI kan hjelpe deg med flere leads, bedre oppfølging, smartere kundedialog og mer effektiv salgsprosess.",
        intro: [
          "Mange bedrifter vet at de bør bruke AI, men er usikre på hvor de skal starte. Skal du ha chatbot? Automatisert oppfølging? Bedre møtebooking? AI-assistent for kundeservice? Innholdsproduksjon? Leadgenerering? Salgsstøtte?",
          "I en første samtale ser vi på bedriften din, kundereisen, dagens salgsprosess og hvor AI kan gi raskest og mest konkret verdi.",
          "Målet er ikke å bruke AI fordi det er trendy. Målet er å bruke AI der det faktisk kan spare tid, øke salget og forbedre kundeopplevelsen.",
        ],
      },
      services: [
        {
          id: "chat-ai-opportunity",
          icon: "Spark",
          iconStyle: "violet",
          title: "AI-mulighetssamtale",
          subtitle: "Praktisk kartlegging for bedrifter",
          duration: 30,
          durationLabel: "30 min",
          price: "Gratis",
          priceNote: "uforpliktende",
          paid: false,
          format: "Google Meet",
          blurb: "En uforpliktende samtale der vi kartlegger hvordan AI kan hjelpe bedriften din med salg, kundedialog, oppfølging eller automatisering.",
          cta: "Book gratis AI-samtale",
          intakeTitle: "Skjema før AI-samtale",
          intakeFields: aiFields(),
        },
        {
          id: "chat-funnel-review",
          icon: "Target",
          iconStyle: "violet",
          title: "AI og salgsfunnel-gjennomgang",
          subtitle: "Nettside, leadfangst, kundereise og oppfølging",
          duration: 60,
          durationLabel: "60 min",
          price: "€195",
          priceNote: "betalt gjennomgang",
          paid: true,
          format: "Google Meet",
          blurb: "Vi går gjennom hvordan du får leads i dag, hva som skjer etter første kontakt, og hvor AI kan forbedre salgsprosessen.",
          cta: "Book funnel-gjennomgang",
          intakeTitle: "Skjema før funnel-gjennomgang",
          intakeFields: aiFields(),
        },
        {
          id: "chat-chatbot-workshop",
          icon: "Bot",
          iconStyle: "violet",
          title: "AI chatbot / kundedialog workshop",
          subtitle: "For deg som vurderer chatbot, AI-assistent eller automatisert kundeservice",
          duration: 60,
          durationLabel: "60 min",
          price: "€195",
          priceNote: "betalt workshop",
          paid: true,
          format: "Google Meet",
          blurb: "For deg som vil se hvordan en AI-assistent kan svare kunder, kvalifisere leads, booke møter og følge opp henvendelser.",
          cta: "Book AI chatbot-samtale",
          intakeTitle: "Skjema før chatbot-workshop",
          intakeFields: aiFields(),
        },
      ],
      crossLinks: [],
    },
    freddyb: {
      domain: "FreddyBremseth.com",
      siteName: "Freddy Bremseth",
      bookingUrl: "freddybremseth.com/book",
      logoUrl: "",
      accent: "amber",
      profile: {
        name: "Freddy Bremseth",
        initials: "FB",
        role: "Uavhengig rådgivning · Strategi · AI",
        location: "Pinoso, Spania",
        tz: "Europa/Madrid (CET)",
        bio: "Jeg hjelper kunder med tryggere beslutninger ved boligkjøp i Spania og strategisk rådgivning for bedrifter, gründere og eiere.",
      },
      page: {
        eyebrow: "Book rådgivning",
        title: "Book rådgivning med Freddy Bremseth",
        lead: "Velg det som passer best for deg: uavhengig bolig-rådgivning i Spania eller strategi og forretningsutvikling.",
        intro: [
          "Jeg hjelper kunder med to hovedområder: tryggere beslutninger ved boligkjøp i Spania og strategisk rådgivning for bedrifter, gründere og eiere.",
          "Velg riktig samtale, så bruker vi tiden konkret på situasjonen din, mulige fallgruver, tydeligere retning og neste steg.",
        ],
      },
      services: [
        {
          id: "freddy-property-clarity",
          icon: "Phone",
          iconStyle: "amber",
          title: "Kort avklaring – passer rådgivning for deg?",
          subtitle: "For deg som er usikker på om du trenger rådgivning",
          duration: 15,
          durationLabel: "15 min",
          price: "Gratis",
          priceNote: "kort avklaring",
          paid: false,
          format: "Telefon / video",
          blurb: "En kort samtale for å avklare om jeg kan hjelpe deg, og hvilken type rådgivning som passer best.",
          cta: "Book kort avklaring",
          intakeTitle: "Skjema før avklaring",
          intakeFields: propertyAdviceFields(),
        },
        {
          id: "freddy-property-advice",
          icon: "Compass",
          iconStyle: "amber",
          title: "Uavhengig kjøpsrådgivning",
          subtitle: "Grundig samtale før du går videre i kjøpsprosessen",
          duration: 60,
          durationLabel: "60 min",
          price: "€195",
          priceNote: "betalt rådgivning",
          paid: true,
          format: "Google Meet / telefon",
          blurb: "Vi går gjennom din situasjon, området, boligen/prosjektet, prosessen, risikoer og spørsmål du bør avklare før du tar neste steg.",
          cta: "Book rådgivningstime",
          intakeTitle: "Skjema før rådgivningsmøte",
          intakeFields: propertyAdviceFields(),
        },
        {
          id: "freddy-project-second-opinion",
          icon: "Search",
          iconStyle: "amber",
          title: "Prosjektgjennomgang / second opinion",
          subtitle: "Konkret bolig, prosjekt, tomt, prospekt, pris eller avtale",
          duration: 90,
          durationLabel: "90 min",
          price: "€395",
          priceNote: "grundig gjennomgang",
          paid: true,
          format: "Google Meet",
          blurb: "For deg som ønsker en mer grundig vurdering av bolig, tomt, prosjekt, utbygger, område, prisnivå og kjøpsprosess.",
          cta: "Book prosjektgjennomgang",
          intakeTitle: "Skjema før prosjektgjennomgang",
          intakeFields: propertyAdviceFields(),
        },
        {
          id: "freddy-strategy",
          icon: "Briefcase",
          iconStyle: "ink",
          title: "Strategi og forretningsutvikling",
          subtitle: "Strategisamtale med Freddy",
          duration: 60,
          durationLabel: "60 min",
          price: "€195",
          priceNote: "betalt rådgivning",
          paid: true,
          format: "Google Meet",
          blurb: "For gründere og bedriftseiere som ønsker bedre retning, mer salg og smartere bruk av AI.",
          cta: "Book strategisamtale",
          intakeTitle: "Skjema før strategimøte",
          intakeFields: strategyFields(),
        },
        {
          id: "freddy-deep-strategy",
          icon: "Briefcase",
          iconStyle: "ink",
          title: "Dyp strategigjennomgang",
          subtitle: "Forretningsmodell, tilbud, nettside, salg, AI eller markedsstrategi",
          duration: 90,
          durationLabel: "90 min",
          price: "€395",
          priceNote: "grundig gjennomgang",
          paid: true,
          format: "Google Meet",
          blurb: "For deg som ønsker en mer omfattende vurdering av bedrift, tilbud, posisjonering, salgsprosess og konkrete forbedringer.",
          cta: "Book strategigjennomgang",
          intakeTitle: "Skjema før strategigjennomgang",
          intakeFields: strategyFields(),
        },
        {
          id: "freddy-monthly-sparring",
          icon: "Calendar",
          iconStyle: "ink",
          title: "Månedlig sparring",
          subtitle: "Fast rådgivning og oppfølging",
          duration: 120,
          durationLabel: "2 x 60 min per måned",
          price: "fra €750/mnd",
          priceNote: "månedlig avtale",
          paid: true,
          format: "Google Meet",
          blurb: "For deg som ønsker fast sparring rundt strategi, salg, AI, beslutninger og videre utvikling.",
          cta: "Send forespørsel om månedlig sparring",
          intakeTitle: "Skjema før forespørsel",
          intakeFields: strategyFields(),
        },
      ],
      crossLinks: [],
    },
  };

  const template = templates[brandId];
  if (!template) return null;
  return {
    published: false,
    brandId,
    ...template,
    updatedAt: new Date().toISOString(),
  };
}

function defaultBookingConfig(brandId: string) {
  const known = knownBookingConfig(brandId);
  if (known) return known;

  const brand = BRANDS.find((item) => item.id === brandId) || BRANDS[0];
  const isRealEstate = brand.type === "real_estate";
  const isAI = brand.id === "chatgenius";
  const isFreddy = brand.id === "freddyb" || brand.id === "freddy";

  return {
    published: false,
    brandId: brand.id,
    domain: brand.website?.replace(/^https?:\/\//, "") || brand.name,
    siteName: brand.name,
    bookingUrl: `${brand.website?.replace(/^https?:\/\//, "") || brand.id}/book`,
    logoUrl: "",
    accent: isAI ? "violet" : isRealEstate ? "leaf" : "amber",
    profile: {
      name: brand.name,
      initials: brand.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      role: isAI ? "AI og salg for bedrifter" : isRealEstate ? "Bolig i Spania" : "Rådgivning og strategi",
      location: isRealEstate ? "Costa Blanca · Spania" : "Norge · Spania · Remote",
      tz: "Europa/Madrid (CET)",
      bio: brand.description || "",
    },
    page: {
      eyebrow: isAI ? "AI og salg" : isRealEstate ? "Bolig i Spania" : "Book rådgivning",
      title: isAI ? "Book en AI- og salgssamtale" : isRealEstate ? "Book en samtale om bolig i Spania" : "Book rådgivning",
      lead: brand.target_audience || brand.description || "",
      intro: [brand.description || "Velg møte og tidspunkt som passer."],
    },
    services: [
      {
        id: `${brand.id}-intro-call`,
        icon: isAI ? "Spark" : isFreddy ? "Briefcase" : "Phone",
        iconStyle: isAI ? "violet" : isRealEstate ? "leaf" : "amber",
        title: isAI ? "AI-mulighetssamtale" : isRealEstate ? "Første boligsamtale" : "Strategisamtale",
        subtitle: "Første avklaring",
        duration: 30,
        durationLabel: "30 min",
        price: "Gratis",
        priceNote: "uforpliktende",
        paid: false,
        format: "Google Meet / telefon",
        blurb: "En uforpliktende samtale for å avklare behov, muligheter og neste steg.",
        cta: "Book gratis samtale",
        intakeTitle: "Hjelp oss forberede samtalen",
        intakeFields: [
          { type: "text", id: "topic", label: "Hva ønsker du hjelp med?", placeholder: "Skriv kort hva du ønsker å snakke om.", required: true },
          { type: "textarea", id: "note", label: "Hva bør vi vite før møtet?", placeholder: "Kort beskrivelse.", required: false },
        ],
      },
    ],
    crossLinks: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  const brandId = request.nextUrl.searchParams.get("brand_id") || request.nextUrl.searchParams.get("brand") || "zeneco";
  if (!supabase) return NextResponse.json({ config: defaultBookingConfig(brandId) });

  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data?.settings?.booking || defaultBookingConfig(brandId) });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const brandId = String(body.brand_id || body.brandId || "").trim();
  const booking = body.booking;
  if (!brandId || !booking) {
    return NextResponse.json({ error: "brand_id and booking are required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  const settings = {
    ...(existing?.settings || {}),
    booking: {
      ...booking,
      brandId,
      updatedAt: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from("brand_settings")
    .upsert({ brand_id: brandId, settings, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, config: settings.booking });
}
