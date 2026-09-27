export type CorporateOutreachTemplate = {
  key: "initial" | "example_followup" | "close_loop";
  dayOffset: number;
  subject: string;
  body: string;
};

export const corporateOutreachTemplates: CorporateOutreachTemplate[] = [
  {
    key: "initial",
    dayOffset: 0,
    subject: "Har dere vurdert bedriftshytte i Spania?",
    body: `Hei {{first_name}},

Jeg arbeider med Zen Corporate Homes, en del av Zen Eco Homes på Costa Blanca.

Vi hjelper norske bedrifter som vurderer en litt annen type ansattgode: å eie en moderne leilighet eller villa i Spania som kan gjøres tilgjengelig for ansatte gjennom året.

For noen virksomheter kan dette være et alternativ til en tradisjonell firmahytte i Norge – bare med sol, strand og helårsbruk på Costa Blanca.

Vi starter ikke med å selge en bestemt bolig. Først ser vi på blant annet:

- hvor mange ansatte som skal kunne bruke boligen
- hvordan bruken kan organiseres
- hvilket budsjett som er realistisk
- aktuelle områder på Costa Blanca
- hvilken type bolig som passer
- forventet drift og lokal oppfølging

Deretter kan vi lage en kostnadsfri første bedriftsvurdering og vise noen konkrete eksempler på hvordan en slik løsning kan se ut.

Hvis dette kan være interessant for {{company_name}}, sender jeg gjerne over et enkelt eksempel.

Med vennlig hilsen

Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes
Costa Blanca, Spania

https://www.zenecohomes.com/bedriftshytte-spania`,
  },
  {
    key: "example_followup",
    dayOffset: 5,
    subject: "Et konkret eksempel på bedriftshytte i Spania",
    body: `Hei {{first_name}},

Jeg følger bare kort opp meldingen min om bedriftshytte i Spania.

Et enkelt eksempel kan være en bedrift med 40–80 ansatte som kjøper en leilighet eller villa på Costa Blanca og gjør den tilgjengelig gjennom en intern bookingordning.

Boligen kan da brukes gjennom store deler av året, samtidig som bedriften eier selve eiendommen.

For noen virksomheter kan boligen også brukes til mindre ledersamlinger, onboarding eller andre bedriftsopphold når dette passer virksomhetens modell.

Vi kan sette opp et uforpliktende eksempel for {{company_name}} med:

- anbefalt boligtype
- realistisk budsjett
- aktuelle områder
- antall mulige bruksuker
- forventede driftskostnader
- noen representative boliger

Hvis du ønsker det, kan jeg sende over en første vurdering uten noen forpliktelse.

Med vennlig hilsen

Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes

https://www.zenecohomes.com/bedriftshytte-spania#bedriftsvurdering`,
  },
  {
    key: "close_loop",
    dayOffset: 14,
    subject: "Skal jeg avslutte denne hos dere?",
    body: `Hei {{first_name}},

Jeg ville bare ta en siste oppfølging om Zen Corporate Homes.

Jeg vet ikke om bedriftshytte eller firmabolig i Spania er aktuelt for dere nå, så jeg skal ikke fylle innboksen din med flere meldinger.

Hvis ideen er interessant, lager jeg gjerne en kostnadsfri første vurdering for {{company_name}} med budsjett, aktuelle områder og eksempler på boliger.

Hvis det ikke er relevant, trenger du selvfølgelig ikke gjøre noe.

Med vennlig hilsen

Freddy Bremseth
Zen Corporate Homes
Zen Eco Homes

https://www.zenecohomes.com/bedriftshytte-spania`,
  },
];

export const corporateOutreachPolicy = {
  language: "nb-NO",
  approved: true,
  stopAfterReply: true,
  stopAfterAssessmentRequest: true,
  stopAfterUnsubscribe: true,
  autoSend: false,
  afterFinalStep: "LONG_TERM_NURTURE",
} as const;

export function personalizeCorporateOutreach(
  template: CorporateOutreachTemplate,
  input: { firstName?: string | null; companyName: string },
) {
  const firstName = String(input.firstName || "").trim() || "der";
  const companyName = String(input.companyName || "").trim();
  return {
    ...template,
    body: template.body
      .replaceAll("{{first_name}}", firstName)
      .replaceAll("{{company_name}}", companyName),
  };
}
