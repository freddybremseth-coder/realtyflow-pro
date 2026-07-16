/**
 * Sjanger-håndverksbibliotek for Forfatter 2.0.
 *
 * Hver sjanger har to deler:
 *   - writing_rules: konkrete håndverksregler som legges inn i skrivepromptene
 *     (både i Bokmotorens kapittelskriving og Forfatterstudioets redigering)
 *   - critique_rubric: det redaktør-passet vurderer et kapittel mot i
 *     to-pass-skrivingen og i kvalitetsscoringen
 *
 * Reglene er skrevet som instrukser til modellen, på norsk, og gjelder
 * uansett hvilket språk boken skrives på.
 */

export type GenreCraft = {
  id: string;
  label: string;
  writing_rules: string;
  critique_rubric: string;
};

const SHARED_RULES = `
- Åpne aldri et kapittel med å annonsere hva kapittelet skal handle om («I dette kapittelet skal vi…»). Start midt i noe konkret: en scene, et eksempel, en påstand eller et spørsmål som griper.
- Forby tomme AI-fraser: «i dagens samfunn», «det er viktig å huske», «la oss dykke ned i», «i en verden der», «avslutningsvis». Skriv som et menneske med noe på hjertet.
- Variér setningslengde. Korte setninger gir trykk. Lengre setninger får lov til å puste når innholdet trenger det.
- Vis, ikke fortell, der det er mulig: konkrete detaljer, tall, navn, situasjoner — ikke abstrakte generaliseringer.
- Aldri finn opp fakta, forskningsfunn, statistikk, personer eller sitater. Er noe usikkert, formuler det som erfaring eller skjønn — eller utelat det.
- Avslutt kapitler med fremdrift (en innsikt, en konsekvens, en bro videre) — ikke med et sammendrag av det som nettopp ble sagt.`;

const CRAFTS: GenreCraft[] = [
  {
    id: "guide",
    label: "Sakprosa / guide",
    writing_rules: `${SHARED_RULES}
- Én bærende idé per kapittel. Alt i kapittelet skal tjene den ideen.
- Hvert hovedpoeng trenger minst ett konkret eksempel, en case eller en situasjon leseren kjenner seg igjen i.
- Gi leseren noe å GJØRE: konkrete steg, sjekklister eller tommelfingerregler — men bare der det er naturlig, ikke som pliktløp.
- Skriv med autoritet fra erfaring («da jeg…», «en klient av meg…» kun hvis kildematerialet gir dekning), ellers med tydelig faglig resonnement.
- Tall og fakta skal være runde og forsiktige med mindre kilden er oppgitt i materialet.`,
    critique_rubric: `Vurder mot: (1) Én tydelig bærende idé? (2) Konkrete eksempler for hvert hovedpoeng, eller bare abstraksjoner? (3) Får leseren noe anvendbart? (4) Åpning som griper vs. innholdsfortegnelse-prosa? (5) AI-fraser, gjentakelser, oppramsende «for det første/andre/tredje»-struktur? (6) Fakta som ser oppdiktet ut?`,
  },
  {
    id: "memoir",
    label: "Memoar / biografi",
    writing_rules: `${SHARED_RULES}
- Skriv i scener der det er mulig: tid, sted, sansedetaljer, hva som ble sagt og gjort. Bruk sammendrag kun som bro mellom scener.
- ALDRI dikt opp hendelser, personer, datoer, steder eller dialog som ikke finnes i kildematerialet. Mangler en detalj, skriv rundt den eller marker [MÅ VERIFISERES].
- Refleksjon skal vokse ut av scenene — ikke leveres som moralske konklusjoner på toppen.
- Behold fortellerens sårbarhet og ærlighet; glatt ikke over det ubehagelige.
- Kronologi kan brytes, men leseren skal alltid vite hvor og når vi er.`,
    critique_rubric: `Vurder mot: (1) Scener med sansedetaljer vs. flatt referat? (2) Noe som ser oppdiktet ut i forhold til kildematerialet — hendelser, dialog, detaljer? (3) Vokser refleksjonen ut av det fortalte? (4) Er stemmen personlig og konsistent? (5) Tidslinje som forvirrer?`,
  },
  {
    id: "children",
    label: "Barnebok",
    writing_rules: `${SHARED_RULES}
- Skriv for høytlesning: les hver setning høyt i hodet. Rytme, gjentakelsesmønstre og lydord er verktøy — bruk dem bevisst.
- Ordforråd tilpasset alderstrinnet, men aldri dumt ned følelser: barn tåler store følelser i trygge rammer.
- Én tydelig hendelse per oppslag/kapittel, og hver scene skal kunne illustreres — tenk «hva ser vi på bildet?».
- Hovedpersonen løser problemet selv (voksne kan hjelpe, ikke redde).
- Gjennomgangsfigurer skal være konsistente i navn, utseende og lynne — følg character bible-en hvis den finnes.
- Humor og varme foran belæring; moralen skal merkes, ikke sies.`,
    critique_rubric: `Vurder mot: (1) Flyter det ved høytlesning — rytme og setningslengde? (2) Aldersriktig ordforråd? (3) Kan hver scene illustreres? (4) Løser barnet problemet selv? (5) Belærende moral-pekefinger? (6) Konsistens for gjengangere?`,
  },
  {
    id: "self_development",
    label: "Selvutvikling",
    writing_rules: `${SHARED_RULES}
- Balanser tre lag i hvert kapittel: historie/eksempel → prinsipp → praksis. Aldri prinsipp alene.
- Snakk TIL leseren (du-form), ikke OM mennesker generelt.
- Vær konkret om det vanskelige: hva som går galt, hvorfor folk gir opp, hvordan det faktisk kjennes. Troverdighet kommer fra motstand, ikke fra solskinn.
- Øvelser og spørsmål skal være så konkrete at leseren kan gjøre dem i kveld.
- Ingen pseudovitenskap: ikke fabrikker studier eller hjerneforskning.`,
    critique_rubric: `Vurder mot: (1) Historie → prinsipp → praksis til stede? (2) Du-form og direkte tiltale? (3) Anerkjennes motstanden, eller er alt lett? (4) Kan øvelsene faktisk gjøres? (5) Fabrikkert forskning eller svevende påstander? (6) Klisjeer («reisen», «ditt beste jeg»)?`,
  },
  {
    id: "fiction",
    label: "Skjønnlitteratur",
    writing_rules: `${SHARED_RULES}
- Hver scene trenger: et mål, motstand og en endring — noe skal stå annerledes når scenen er over.
- Hold synsvinkelen disiplinert: én POV per scene, ingen hodehopping.
- Dialog skal gjøre to ting samtidig (avsløre karakter OG drive handling). Kutt høflighetsfraser.
- Beskrivelser gjennom karakterens blikk og humør — ikke nøytral kamera-prosa.
- Plant og innfri: detaljer som nevnes skal få betydning; løfter til leseren skal holdes (sjekk bok-bibelen).
- Undertekst foran utsagn: la leseren forstå mer enn karakterene sier.`,
    critique_rubric: `Vurder mot: (1) Har scenene mål/motstand/endring, eller er det transportetapper? (2) POV-brudd? (3) Gjør dialogen arbeid, eller er den fyll? (4) Konsistens med bok-bibelen (navn, fakta, planter)? (5) Fortalt følelse der den burde vært vist? (6) Klisjébilder?`,
  },
];

const DEFAULT_CRAFT: GenreCraft = {
  id: "default",
  label: "Generell",
  writing_rules: SHARED_RULES,
  critique_rubric: `Vurder mot: (1) Griper åpningen? (2) Konkret vs. abstrakt? (3) AI-fraser og gjentakelser? (4) Konsistens med resten av boken? (5) Gir slutten fremdrift?`,
};

/**
 * Finn riktig håndverkssett fra prosjektets genre-felt (fritekst).
 * Matcher på substrenger så «children_book», «barnebok» og «kids» alle
 * treffer barnebok-settet.
 */
export function resolveCraft(genre?: string | null): GenreCraft {
  const value = String(genre || "").toLowerCase();
  if (!value) return CRAFTS[0]; // guide er standard i Bokmotoren
  if (/(children|barn|kids|picture)/.test(value)) return CRAFTS[2];
  if (/(memoir|biograf|livshistorie)/.test(value)) return CRAFTS[1];
  if (/(self|selvutvikling|personal|utvikling|mindset)/.test(value)) return CRAFTS[3];
  if (/(fiction|roman|novel|fortell|skjønn)/.test(value)) return CRAFTS[4];
  if (/(guide|sakprosa|fag|non.?fiction|howto|how-to)/.test(value)) return CRAFTS[0];
  return DEFAULT_CRAFT;
}

// ─── Bok-bibel ────────────────────────────────────────────────────────────────
// Kontinuitets-minnet som følger prosjektet: hva hvert kapittel faktisk
// dekket, løfter til leseren og terminologi. Lagres i
// metadata_plan.book_bible og mates inn i hvert nye kapittel.

export type BookBible = {
  chapter_summaries: Array<{ chapter_title: string; summary: string }>;
  promises: string[];
  terminology: string[];
};

export function emptyBible(): BookBible {
  return { chapter_summaries: [], promises: [], terminology: [] };
}

export function bibleFromMetadata(metadata: Record<string, unknown> | null | undefined): BookBible {
  const raw = (metadata as any)?.book_bible;
  return {
    chapter_summaries: Array.isArray(raw?.chapter_summaries) ? raw.chapter_summaries : [],
    promises: Array.isArray(raw?.promises) ? raw.promises.map(String) : [],
    terminology: Array.isArray(raw?.terminology) ? raw.terminology.map(String) : [],
  };
}

export function bibleForPrompt(bible: BookBible, maxChars = 4500): string {
  if (bible.chapter_summaries.length === 0 && bible.promises.length === 0 && bible.terminology.length === 0) {
    return "(Ingen tidligere kapitler — dette er starten av boken.)";
  }
  const parts = [
    bible.chapter_summaries.length
      ? `Tidligere kapitler:\n${bible.chapter_summaries.map((c, i) => `${i + 1}. ${c.chapter_title}: ${c.summary}`).join("\n")}`
      : "",
    bible.promises.length ? `Løfter gitt til leseren (skal innfris, ikke gjentas): ${bible.promises.join(" · ")}` : "",
    bible.terminology.length ? `Etablert terminologi (bruk konsekvent): ${bible.terminology.join(" · ")}` : "",
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, maxChars);
}

/** Formater forfatterens stemmeprøve for prompt-bruk. */
export function voiceForPrompt(voiceSample?: string | null, maxChars = 3000): string {
  const sample = String(voiceSample || "").trim();
  if (!sample) return "";
  return `\nFORFATTERENS STEMME — etterlign rytme, tone og temperament fra denne prøven (ikke innholdet):\n---\n${sample.slice(0, maxChars)}\n---\n`;
}
