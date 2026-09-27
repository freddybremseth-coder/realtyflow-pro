import type { WorkspacePermission } from "./brand-policy";

export type TrainingSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  emphasis?: string;
};

export type TrainingArticle = {
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  readMinutes: number;
  brands: "all" | string[];
  anyPermissions?: WorkspacePermission[];
  sections: TrainingSection[];
};

export const WORKSPACE_TRAINING_ARTICLES: TrainingArticle[] = [
  {
    id: "how-we-work",
    title: "Slik jobber vi – fra aktivitet til lead, kunde og salg",
    shortTitle: "Slik jobber vi",
    summary: "Forstå hva RealtyFlow skal hjelpe deg med, hvem som gjør hva og hvordan godt arbeid blir til resultater.",
    readMinutes: 7,
    brands: "all",
    sections: [
      {
        heading: "Målet er ikke å bruke RealtyFlow – målet er å skape resultater",
        paragraphs: [
          "RealtyFlow er motoren som samler leads, innhold, søkedata, kampanjer, Corporate-arbeid, eiendommer og oppgaver. Du trenger ikke forstå hele systemet. Du skal bruke den delen som hjelper deg å få gjort dagens viktigste arbeid.",
          "Vi måler godt arbeid i flere trinn: bedre synlighet gir relevante besøk, relevante besøk gir leads, gode leads gir samtaler og møter, og gode samtaler gir visninger, tilbud og salg. Aktivitet som ikke bidrar til denne kjeden skal utfordres.",
        ],
        emphasis: "Spør alltid: Hva er neste konkrete handling som kan flytte dette nærmere en kunde, et møte eller et salg?",
      },
      {
        heading: "Rollefordelingen",
        bullets: [
          "Andrea: leads, markedsføring, kundereise, business development, Corporate, innhold, kampanjer og digitale møter. Rollen skal gradvis bli mer selvstendig også i eiendomsarbeidet.",
          "Erlend: særlig Google, teknisk SEO, søkeord, Search Console og analyse. Andrea kan jobbe aktivt med SEO/GEO/AEO og innhold, men tekniske funn og dyp analyse kan løses sammen med Erlend.",
          "Freddy: aktiv kundedialog, bolig- og tomteforslag, visninger, kontakt med utbyggere/meglere, forhandling og closing. Når et lead blir varmt, skal informasjonen være god nok til at Freddy kan ta det videre uten å starte på nytt.",
          "Anna: økonomikontroll, provisjoner, betalinger, regnskap og økonomisk oversikt.",
        ],
      },
      {
        heading: "En god arbeidsdag i RealtyFlow",
        bullets: [
          "Start med «I dag»: velg det viktigste arbeidet, ikke den mest interessante funksjonen.",
          "Følg opp varme leads før kalde leads.",
          "Arbeid med Corporate-prospekter som har tydelig fit og et realistisk neste steg.",
          "Bruk SEO Sam og søkedata til å finne hva vi bør forbedre eller skrive – ikke lag innhold uten en hensikt.",
          "Opprett én konkret neste handling med ansvar og frist når du avslutter en oppgave.",
          "Dokumenter hva som er funnet og gjort, slik at neste person kan fortsette uten å gjenta research.",
        ],
      },
      {
        heading: "Når skal du levere videre?",
        paragraphs: [
          "Du skal ikke holde på en oppgave bare fordi du startet den. Handoff er en del av systemet. Når en kunde trenger konkrete boliger, visning, utbyggerdialog, prisdiskusjon eller closing, går den naturlig videre til Freddy. Når en SEO-sak blir teknisk, kan Erlend kobles inn. Økonomiske spørsmål går til Anna.",
        ],
        emphasis: "God handoff betyr: hvem kunden er, hva de ønsker, hva vi vet, hva som er gjort og hva neste anbefalte handling er.",
      },
    ],
  },
  {
    id: "understand-realtyflow",
    title: "Forstå RealtyFlow – hva informasjonen betyr og hva du skal gjøre med den",
    shortTitle: "Forstå RealtyFlow",
    summary: "En enkel forklaring av leads, scores, SEO-funn, oppgaver, kampanjer og eiendomsdata – og hva som krever menneskelig vurdering.",
    readMinutes: 9,
    brands: "all",
    sections: [
      {
        heading: "RealtyFlow prioriterer – du vurderer",
        paragraphs: [
          "Systemet samler mange signaler og gjør det lettere å se hva som fortjener oppmerksomhet. En score, status eller anbefaling er aldri en ordre eller en garanti. Bruk informasjonen til å prioritere, og bruk faglig skjønn før du kontakter en kunde, endrer en tekst eller foreslår en bolig.",
        ],
        emphasis: "Tenk på RealtyFlow som en svært god arbeidsassistent: den husker, sorterer og finner signaler. Mennesket avgjør hva signalene betyr.",
      },
      {
        heading: "Leads og CRM",
        bullets: [
          "Kontaktdata forteller hvem vi kjenner og hvordan vi kan nå dem.",
          "Pipeline/status sier hvor kunden befinner seg i prosessen, men må holdes oppdatert for å ha verdi.",
          "En lead uten neste handling blir lett glemt. Bruk derfor oppgaver og frister aktivt.",
          "Noter bare relevante fakta og neste steg – ikke fyll CRM med lange, ustrukturerte tekster.",
        ],
      },
      {
        heading: "Corporate fit-score",
        bullets: [
          "Fit-score og tier hjelper oss å sortere hvilke selskaper som er mest interessante å undersøke først.",
          "Scoren er ikke bevis på kjøpsinteresse. Den sier at virksomheten ser ut til å ligne målgruppen vår.",
          "Fit reasons viser hvorfor systemet mener prospektet er interessant.",
          "Evidence gaps viser hva som mangler før vi kan være sikre på hypotesen. Dette er ofte den viktigste research-listen.",
          "Next action skal være konkret: finn riktig rolle, bekreft benefit-program, send introduksjon eller avtal oppfølging.",
        ],
      },
      {
        heading: "SEO Sam, Google og AI-søk",
        bullets: [
          "SEO Sam viser funn, datakvalitet og foreslåtte tiltak. Prioriter tiltak som påvirker viktige sider eller kundereiser.",
          "Search/AI-henvisninger viser hvor besøk kommer fra. De er et signal om synlighet, ikke automatisk et signal om salg.",
          "Topp landingssider forteller hvilke sider som faktisk blir oppdaget. Spør deretter om siden har riktig budskap og et godt neste steg.",
          "En teknisk feil kan gjøre tallene ufullstendige. Les alltid datastatus før du trekker konklusjoner.",
        ],
      },
      {
        heading: "Annonser og kampanjer",
        bullets: [
          "Kampanjestatus forteller hva som er opprettet eller tidligere kjørt.",
          "Målgruppe og growth goal forklarer hva kampanjen forsøker å oppnå.",
          "Estimert kostnad er informasjon – ikke en fullmakt til å bruke budsjett.",
          "En annonseidé er ikke god fordi den er kreativ. Den er god hvis den treffer riktig målgruppe med riktig budskap og leder til en målbar handling.",
        ],
      },
      {
        heading: "Eiendommer",
        bullets: [
          "Katalogen viser publiserte boliger som kan brukes i kundearbeidet.",
          "Pris og tilgjengelighet kan endre seg. Verifiser før du lover noe til kunden.",
          "Velg boliger ut fra kundens behov, ikke bare fordi de ser attraktive ut.",
          "Når kunden blir konkret, dokumenter hvorfor et forslag passer eller ikke passer. Det gjør neste runde bedre.",
        ],
      },
      {
        heading: "Arbeidsoppgaver",
        bullets: [
          "En god oppgave beskriver én konkret handling, ikke et helt prosjekt.",
          "Bruk frist når tidspunktet betyr noe.",
          "Bruk neste handling til å gjøre det åpenbart hva som skal skje når oppgaven åpnes igjen.",
          "Ferdig betyr at resultatet er lagret eller sendt videre – ikke bare at du har tenkt på saken.",
        ],
      },
    ],
  },
  {
    id: "zeneco-focus",
    title: "Zen Eco Homes – hva vi selger, til hvem og hvorfor",
    shortTitle: "Zen Eco Homes",
    summary: "Hovedfokus, kundeløfte og hvordan vi skaper verdi før kunden velger bolig.",
    readMinutes: 8,
    brands: ["zeneco"],
    sections: [
      {
        heading: "Hva Zen Eco Homes skal være",
        paragraphs: [
          "Zen Eco Homes skal være en trygg, moderne og kunnskapsrik inngang til bolig i Spania. Vi konkurrerer ikke bare på boliger. De samme boligene kan ofte finnes flere steder. Verdien vår ligger i å hjelpe kunden å forstå områder, alternativer, prosess, risiko og hva som faktisk passer deres liv.",
          "Uttrykket er moderne Mediterranean living: høy kvalitet, gode omgivelser, energieffektive og moderne boliger der det passer, og en profesjonell kjøpsreise med norsk/skandinavisk forståelse.",
        ],
      },
      {
        heading: "Hvem vi ønsker å tiltrekke",
        bullets: [
          "Privatkunder som vurderer feriebolig, permanent bolig eller investering i Spania.",
          "Kunder som trenger hjelp til å velge mellom områder, boligtyper og budsjett – ikke bare en lenke til en bolig.",
          "Kunder som verdsetter trygg oppfølging, språk, lokal kunnskap og hjelp gjennom prosessen.",
          "Bedrifter, organisasjoner og medlemsaktører som kan bruke bolig i Spania som ansattgode, medlemsfordel, arbeidsopphold, retreat eller langsiktig ressurs.",
        ],
      },
      {
        heading: "Hva godt innhold skal gjøre",
        bullets: [
          "Svare på spørsmål kunden faktisk har før de tar kontakt.",
          "Gjøre Zen Eco Homes synlig i Google og AI-svar når noen undersøker bolig i Spania.",
          "Bygge tillit gjennom konkrete sammenligninger, guider, priser, områder, prosess og realistiske forventninger.",
          "Ha et tydelig neste steg: se boliger, bestill samtale, sammenlign områder eller ta kontakt.",
        ],
        emphasis: "Vi lager ikke innhold for å fylle en kanal. Vi lager innhold som reduserer usikkerhet og flytter en potensiell kunde nærmere kontakt.",
      },
    ],
  },
  {
    id: "pinoso-focus",
    title: "Pinoso EcoLife – plass, tomter, villaer og et annet liv i Spania",
    shortTitle: "Pinoso EcoLife",
    summary: "Hvordan Pinoso skiller seg fra kysten, hvem vi søker og hvordan vi kommuniserer verdien.",
    readMinutes: 7,
    brands: ["pinosoecolife"],
    sections: [
      {
        heading: "Posisjoneringen",
        paragraphs: [
          "Pinoso EcoLife handler ikke om å kopiere kystmarkedet lenger inn i landet. Vi selger et annet valg: mer plass, større tomter, moderne villaer, roligere omgivelser og muligheten til å bygge et liv med mer frihet og natur.",
          "Tomten og totalprosjektet er ofte like viktig som selve boligen. Derfor skal vi alltid være presise om tomtestørrelse, hva som er inkludert, pris, tilgjengelighet og hva som må verifiseres.",
        ],
      },
      {
        heading: "Kundene vi vil finne",
        bullets: [
          "Familier og par som ønsker mer plass enn kysten gir for samme budsjett.",
          "Kunder som vurderer tomt + nybygg og trenger hjelp til å forstå totalprosjektet.",
          "Kunder som kan bo litt lenger fra stranden for å få natur, privatliv og større eiendom.",
          "Kunder som ønsker et reelt spansk hverdagsliv, men fortsatt praktisk tilgang til kyst, flyplass og tjenester.",
        ],
      },
      {
        heading: "Hvordan vi bygger tillit",
        bullets: [
          "Vær konkret om avstander, område, tjenester og hverdagsliv.",
          "Ikke lov byggbarhet, senere utvidelse, besparelser eller avkastning uten verifisering.",
          "Vis forskjellen mellom tomtekjøp, byggekostnad og ferdig totalbudsjett.",
          "Bruk ekte boliger, tomter og områdeinnhold til å gjøre valget forståelig.",
        ],
      },
    ],
  },
  {
    id: "corporate-value",
    title: "Corporate Homes – hvorfor dette kan bli en stor salgskanal",
    shortTitle: "Hvorfor Corporate?",
    summary: "Forstå verdien for bedriften, hvem vi bør kontakte og hvordan Corporate kan skape gjentakende leads.",
    readMinutes: 12,
    brands: ["zeneco"],
    anyPermissions: ["corporate.read", "corporate.plan"],
    sections: [
      {
        heading: "Hvorfor Corporate er interessant",
        paragraphs: [
          "Et privat boligkjøp gir normalt én kunde. En god Corporate-relasjon kan gi tilgang til mange ansatte, medlemmer eller samarbeidspartnere over tid. Derfor kan én god avtale være mer verdifull enn mange enkeltstående kalde leads.",
          "Vi trenger ikke selge ideen som «bedriften skal bli eiendomsinvestor». Vi skal finne den praktiske verdien for akkurat den organisasjonen: ansattgode, workation, leder-/teamopphold, rekreasjon, rekruttering og retention, medlemsfordel eller en ordning der ansatte får tilgang til rådgivning og boligmuligheter i Spania.",
        ],
        emphasis: "Corporate handler om å løse et HR-, medlems-, trivsel- eller forretningsbehov. Eiendommen er løsningen – ikke inngangen til samtalen.",
      },
      {
        heading: "Hvilke virksomheter er mest interessante?",
        bullets: [
          "Bedrifter med mange ansatte og tydelig fokus på trivsel, benefits, employer branding eller fleksibelt arbeid.",
          "Kunnskapsbedrifter der ansatte kan arbeide digitalt og der workation/opphold kan ha verdi.",
          "Bedrifter med sterke resultater, rekrutteringsbehov eller kostbare nøkkelmedarbeidere.",
          "Organisasjoner, foreninger og medlemsnettverk som ønsker attraktive medlemsfordeler.",
          "Rådgivere, HR-/benefit-aktører og profesjonelle partnere som allerede har mange bedriftskunder og kan bli en kanal inn til flere selskaper.",
        ],
      },
      {
        heading: "Hvem kontakter vi?",
        bullets: [
          "Større virksomheter: HR, People & Culture, Benefits, Employer Branding, Operations eller relevante partnerskapsroller.",
          "Mindre og mellomstore bedrifter: daglig leder, eier, HR-ansvarlig eller administrasjon.",
          "Foreninger: medlemsfordeler, partnerskap, kommersiell leder eller generalsekretær/daglig leder.",
          "Partnerkanaler: rådgivningsselskaper, bransjeorganisasjoner, finans-/forsikringsmiljøer og andre som allerede har tillit hos målgruppen.",
        ],
      },
      {
        heading: "Slik jobber du et Corporate-prospekt",
        bullets: [
          "1. Research: Hva gjør virksomheten, hvor mange ansatte/medlemmer har den, og hvorfor kan tilbudet være relevant?",
          "2. Hypotese: Skriv én konkret setning om hvilken verdi Zen Eco Homes kan skape for akkurat dem.",
          "3. Bevis: Lagre offentlig kilde og fakta som støtter hypotesen. Ikke gjett på interne behov.",
          "4. Kontaktvei: Finn riktig funksjon eller bruk offisiell selskapskanal. Ikke spray generiske e-poster til tilfeldige personer.",
          "5. Første mål: Få en kort samtale eller avklaring – ikke selg en villa i første melding.",
          "6. Oppfølging: Logg hva som er sendt/gjort og bestem neste dato/handling.",
          "7. Handoff: Når det finnes reell interesse, involver Freddy i løsning, boligvalg, økonomisk modell og videre møte.",
        ],
      },
      {
        heading: "Hva skal første samtale oppnå?",
        paragraphs: [
          "Vi skal forstå deres behov før vi foreslår modell. En bedrift med 30 ansatte kan trenge noe helt annet enn en organisasjon med 20 000 medlemmer. Målet er å finne ut hvem ordningen er for, hvor ofte den kan brukes, hvordan den skal administreres og hvilken verdi de ønsker å skape.",
        ],
        bullets: [
          "Hvem skal ha tilgang – ansatte, ledelse, kunder eller medlemmer?",
          "Er målet trivsel, retention, workation, incentive, medlemsfordel eller noe annet?",
          "Trenger de én bolig, flere boliger eller primært en fordel/rådgivning for individuelle kjøpere?",
          "Hvor mye administrasjon ønsker de selv å håndtere?",
          "Hva må være på plass for at de skal teste konseptet?",
        ],
      },
      {
        heading: "Hvordan Corporate skaper inntekt",
        paragraphs: [
          "Verdien kommer både direkte og indirekte. Direkte kan en bedrift eller organisasjon føre til eiendomskjøp. Indirekte kan avtalen skape mange kvalifiserte privatkunder gjennom ansatte eller medlemmer. I tillegg kan en partnerkanal gi nye Corporate-prospekter uten at vi må starte fra null hver gang.",
        ],
        emphasis: "Målet er ikke flest mulig selskaper i databasen. Målet er et mindre antall relevante selskaper med en tydelig vei til møte, pilot, partneravtale eller boligkjøp.",
      },
    ],
  },
  {
    id: "corporate-outreach",
    title: "Corporate outreach – fra research til første møte",
    shortTitle: "Corporate kontakt",
    summary: "En praktisk metode for å finne riktig inngang og få svar uten å fremstå som generisk eiendomssalg.",
    readMinutes: 10,
    brands: ["zeneco"],
    anyPermissions: ["corporate.plan"],
    sections: [
      {
        heading: "Før du kontakter noen",
        bullets: [
          "Les virksomhetens nettside og forstå hva de faktisk gjør.",
          "Finn antall ansatte/medlemmer, geografi og relevante offentlige signaler.",
          "Se etter benefits, employer branding, remote work, medlemsfordeler, konferanser eller andre tegn på fit.",
          "Skriv ned hvorfor akkurat denne virksomheten er interessant. Hvis du ikke kan forklare det på to setninger, er researchen ikke ferdig.",
        ],
      },
      {
        heading: "Den første kontakten",
        paragraphs: [
          "Første kontakt skal være kort, relevant og nysgjerrig. Vi leder med virksomhetens mulige verdi, ikke med eiendomsannonser. Målet er å finne ut om konseptet fortjener en 15–20 minutters samtale.",
        ],
        bullets: [
          "Vis at meldingen er skrevet til dem – referer til en relevant egenskap ved virksomheten.",
          "Forklar konseptet i én enkel setning.",
          "Still ett lett spørsmål eller foreslå en kort samtale.",
          "Unngå lange presentasjoner, kataloger og mange vedlegg i første kontakt.",
          "Hvis vi bruker en generell selskapskanal, skriv slik at meldingen enkelt kan videresendes internt til HR/ledelse.",
        ],
      },
      {
        heading: "Oppfølging uten å mase",
        bullets: [
          "Sett alltid en konkret oppfølgingsdato i RealtyFlow.",
          "Neste kontakt skal tilføre noe nytt: et eksempel, en enkel modell, en relevant artikkel eller et avklart spørsmål.",
          "Hvis det ikke er respons etter en fornuftig sekvens, marker prospektet for senere oppfølging i stedet for å fortsette med identiske meldinger.",
          "Når noen svarer, oppdater status og skriv neste handling med én gang.",
        ],
      },
      {
        heading: "Når er et Corporate-lead varmt?",
        bullets: [
          "De ber om møte, presentasjon eller konkrete eksempler.",
          "De forteller hvordan ansatte/medlemmer kan bruke ordningen.",
          "De spør om pris, drift, administrasjon, bruk, juridisk struktur eller konkrete boliger.",
          "De involverer HR, ledelse, innkjøp eller en annen beslutningstaker.",
        ],
        emphasis: "Når prospektet blir varmt skal Andrea ikke sitte alene og «research'e litt til». Da er målet å få Freddy inn i neste kommersielle samtale.",
      },
    ],
  },
  {
    id: "visibility-content",
    title: "SEO, GEO og AEO – hvordan synlighet blir til leads",
    shortTitle: "Google & AI-søk",
    summary: "Hva SEO/GEO/AEO betyr i praksis og hvordan vi bruker data til å velge innhold som kan gi kunder.",
    readMinutes: 10,
    brands: "all",
    anyPermissions: ["visibility.read", "visibility.plan"],
    sections: [
      {
        heading: "Tre typer synlighet – ett mål",
        bullets: [
          "SEO: bli synlig i tradisjonelle søkemotorer når noen søker etter det vi tilbyr.",
          "AEO: strukturere svar slik at søkemotorer og svarmotorer enkelt kan hente et presist svar.",
          "GEO: gjøre innhold og merkevare tydelig nok til å bli forstått og sitert av generative AI-tjenester.",
        ],
        emphasis: "Vi optimaliserer ikke for algoritmer alene. Vi gjør det enklere for både mennesker og maskiner å forstå hvem vi hjelper, hvor, med hva og hvorfor vi er relevante.",
      },
      {
        heading: "Slik bruker du SEO Sam",
        bullets: [
          "Start med faktiske funn: hvilke sider får trafikk, hvilke spørsmål mangler svar, og hvilke tekniske problemer blokkerer synlighet?",
          "Prioriter problemer som kan påvirke leads eller viktige landingssider.",
          "Lag en konkret oppgave når noe bør endres – med side, søkeintensjon og ønsket resultat.",
          "Tekniske SEO-problemer kan eskaleres til Erlend; innhold, søkeord, FAQ, struktur og kundespråk kan Andrea jobbe aktivt med.",
        ],
      },
      {
        heading: "Velg søkeord etter kundens intensjon",
        bullets: [
          "Informasjon: «hvor er det best å bo på Costa Blanca?» – bygg tillit og få brukeren videre til relevante guider.",
          "Sammenligning: «Albir eller Benidorm», «kyst eller Pinoso» – hjelp kunden å ta et valg.",
          "Kommersiell: «nybygg Costa Blanca», «villa Pinoso med tomt» – vis relevante løsninger og tydelig CTA.",
          "Handling: «megler Costa Blanca norsk», «book visning Pinoso» – gjør kontakt og booking enkelt.",
        ],
      },
      {
        heading: "Et godt innholdsstykke",
        bullets: [
          "Har ett tydelig hovedspørsmål eller én søkeintensjon.",
          "Gir et reelt svar tidlig på siden.",
          "Bruker konkrete steder, tall og forhold når de er verifisert.",
          "Har tydelige mellomtitler, FAQ og internlenker til neste naturlige steg.",
          "Avslutter med en relevant handling – kontakt, booking, boligliste eller guide.",
        ],
      },
    ],
  },
  {
    id: "leads-handoff",
    title: "Leads – kvalifiser godt før du sender kunden videre",
    shortTitle: "Leads & handoff",
    summary: "Hvordan vi unngår å miste leads og samtidig sørger for at salgsteamet bruker tiden på de riktige kundene.",
    readMinutes: 8,
    brands: "all",
    anyPermissions: ["crm.read", "crm.write", "crm.joint.read", "crm.joint.write"],
    sections: [
      {
        heading: "Hva vi trenger å vite",
        bullets: [
          "Hva ønsker kunden å kjøpe eller oppnå?",
          "Hvilke områder vurderer de – og hva er viktigst med området?",
          "Omtrentlig budsjett og finansiering.",
          "Tidshorisont for kjøp eller reise til Spania.",
          "Boligtype, antall soverom og viktige krav.",
          "Hva har kunden allerede sett eller forkastet – og hvorfor?",
        ],
      },
      {
        heading: "Kvalitet foran mengde",
        paragraphs: [
          "Et navn og en e-postadresse er ikke det samme som et kvalifisert lead. God lead-oppfølging skal redusere usikkerhet og hjelpe kunden fremover, samtidig som vi lærer nok til å bruke salgstiden riktig.",
        ],
        emphasis: "Den beste handoffen til Freddy er ikke «kunde er interessert». Den er en kort oppsummering av behov, budsjett, område, timing, innvendinger og neste ønskede steg.",
      },
      {
        heading: "Ikke mist momentum",
        bullets: [
          "Svar raskt når et lead viser tydelig interesse.",
          "Sett alltid neste handling og dato.",
          "Hvis kunden trenger boliger, opprett en klar handoff i stedet for å la dialogen stoppe.",
          "Bruk innhold, guider og relevante boliger for å hjelpe kunden mellom samtalene.",
        ],
      },
    ],
  },
  {
    id: "email-reach",
    title: "E-post & Reach – oppfølging som skaper samtaler",
    shortTitle: "E-post & Reach",
    summary: "Når du skal sende én personlig oppfølging, når Reach passer bedre, og hvordan vi unngår både spam og tapte muligheter.",
    readMinutes: 9,
    brands: "all",
    anyPermissions: ["email.read", "email.draft", "email.send"],
    sections: [
      {
        heading: "To forskjellige jobber",
        paragraphs: [
          "Én-til-én e-post brukes når vi kjenner mottakeren eller har en konkret, lovlig selskapskanal og et relevant neste steg. Reach brukes for kampanjer og nyhetsbrev til mottakere som hører hjemme i en kontrollert abonnentliste.",
          "RealtyFlow holder disse flytene adskilt. Medarbeiderverktøyet legger ikke automatisk CRM-kunder inn som abonnenter i Reach.",
        ],
        emphasis: "Målet er svar og fremdrift – ikke flest mulig sendte e-poster.",
      },
      {
        heading: "God lead-oppfølging",
        bullets: [
          "Referer til det kunden faktisk har spurt om eller vist interesse for.",
          "Svar på det viktigste først og hold meldingen enkel å lese.",
          "Gi ett tydelig neste steg: kort samtale, spørsmål, boligforslag eller avtale om visning.",
          "Ikke send samme standardtekst til alle. Bruk CRM-informasjonen til å gjøre oppfølgingen relevant.",
          "Når kunden svarer eller blir konkret, oppdater neste handling slik at momentum ikke forsvinner.",
        ],
      },
      {
        heading: "Corporate outreach",
        paragraphs: [
          "Corporate-e-post skal åpne en forretningssamtale, ikke selge en tilfeldig villa. Start med hvorfor konseptet kan være relevant for akkurat virksomheten: ansattgode, workation, retention, medlemsfordel, leder-/teamopphold eller en annen dokumentert hypotese.",
        ],
        bullets: [
          "Bruk bare den verifiserte selskapskanalen RealtyFlow viser.",
          "Hold første melding kort nok til at den kan videresendes internt til riktig HR-/lederrolle.",
          "Be om en kort avklaring eller samtale – ikke om et stort kjøpsvedtak.",
          "Når det kommer reell interesse, få Freddy inn i den kommersielle samtalen.",
        ],
      },
      {
        heading: "Når Reach passer",
        bullets: [
          "Nyhetsbrev til en eksisterende, kontrollert abonnentliste.",
          "Invitasjon til informasjonsmøte eller webinar når mottakergrunnlaget er riktig.",
          "Nyttige marked-/områdeoppdateringer som folk faktisk har bedt om eller meldt seg på.",
          "Kampanjer der vi vil måle åpning, klikk og respons over tid.",
        ],
        emphasis: "Et Reach-utkast er ikke en tillatelse til å abonnere noen. Mottakerlisten og samtykket må være riktig før masseutsending.",
      },
      {
        heading: "Hva RealtyFlow kontrollerer før én-til-én sending",
        bullets: [
          "At du fortsatt har sendetilgang til akkurat denne merkevaren.",
          "At mottakeren fortsatt er innenfor ditt CRM-/Corporate-scope.",
          "At mottakeradressen kommer fra serverdata og ikke er skrevet inn fritt i requesten.",
          "At CRM ikke har do-not-contact eller e-postsperre registrert.",
          "At riktig brand-e-postkonto brukes.",
        ],
      },
    ],
  },
  {
    id: "campaigns-events",
    title: "Annonser, video og informasjonsmøter – skap etterspørsel, ikke bare rekkevidde",
    shortTitle: "Kampanjer & møter",
    summary: "Hvordan kampanjer, videoer og webinarer brukes for å skape kvalifiserte leads og konkrete neste steg.",
    readMinutes: 8,
    brands: "all",
    anyPermissions: ["ads.read", "ads.draft", "events.plan"],
    sections: [
      {
        heading: "Start med forretningsmålet",
        bullets: [
          "Hvilken målgruppe vil vi nå?",
          "Hvilket problem eller ønske skal vi treffe?",
          "Hva skal personen gjøre etterpå – lese, registrere seg, booke møte eller se boliger?",
          "Hvordan vet vi om kampanjen virker?",
        ],
      },
      {
        heading: "Video",
        paragraphs: [
          "Video fungerer best når den svarer på ett tydelig spørsmål. En kort video om «hva koster en moderne villa med stor tomt i Pinoso?» eller «kan en bedrift bruke bolig i Spania som ansattgode?» har et tydelig publikum og en naturlig vei videre.",
        ],
      },
      {
        heading: "Informasjonsmøter og webinarer",
        bullets: [
          "Velg et tema med tydelig nytte, ikke bare «bolig i Spania».",
          "Bygg registrering rundt et konkret spørsmål eller problem.",
          "Samle spørsmål fra deltakerne – de er råmateriale til nye artikler, videoer og FAQ.",
          "Følg opp deltakerne etter møtet og skill mellom de som bare lærte og de som vil videre nå.",
        ],
        emphasis: "Et godt informasjonsmøte er både salg, markedstest og innholdsresearch på samme tid.",
      },
    ],
  },
];

export function trainingArticlesFor(params: {
  brandKey: string;
  permissions: WorkspacePermission[];
}) {
  const { brandKey, permissions } = params;
  return WORKSPACE_TRAINING_ARTICLES.filter(article => {
    const brandAllowed = article.brands === "all" || article.brands.includes(brandKey);
    if (!brandAllowed) return false;
    if (!article.anyPermissions?.length) return true;
    return article.anyPermissions.some(permission => permissions.includes(permission));
  });
}
