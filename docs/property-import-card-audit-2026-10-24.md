# Eiendomsimport → boligkort: feltoversikt og beslutningsgrunnlag for Andrea

Dato: 2026-10-24. Grunnlag: kode på `main` og **lese-spørringer** mot produksjonsprosjektet RealtyflowPRO (`public.properties`, `import_sources`, `property_feed_source_cache`). Ingen eiendommer er endret.

## 1. Hvorfor dette dokumentet finnes
Andrea trenger en oppdatert, etterprøvbar oversikt over **hva feeden kan inneholde**, **hva importparseren leser**, **hva databasen lagrer**, **hva ansatt-/nettsidevisning får tilgang til**, og **hva som egner seg på boligkort kontra detaljside**. Disse fem nivåene må ikke blandes sammen. Manglende kildefelt er ikke det samme som feil i lagring, og `false` er ikke det samme som «ukjent».

## 2. Produksjonsstatus – kontrollert 2026-10-24
Antall `properties`: **1 740**, alle med `source=redsp` og `status=TILGJENGELIG` (ikke det samme som bekreftet tilgjengelig). **1 739** har publiseringsflaggene `show_on_website=true` og `website_visible=true`.

| Felt | Utfylt av 1 740 | Kommentar |
|---|---:|---|
| ref | 1 739 | Teknisk identifikasjon |
| pris > 0 | 1 739 | Prisens aktualitet ikke verifisert |
| title | 1 740 | |
| location | 1 740 | |
| bedrooms > 0 | 1 725 | Null kan bety ikke oppgitt |
| bathrooms > 0 | 1 739 | |
| built_area eller area_m2 > 0 | 1 516 | 224 mangler |
| plot_size > 0 | 728 | Ikke obligatorisk for leiligheter |
| description | 1 739 | Importvisningen forkorter vanlig beskrivelse |
| source_description | 1 739 | Full kildebeskrivelse bevart separat |
| primary_image eller images | 1 739 | |
| gallery minst ett bilde | 1 703 | |
| amenities_no minst ett element | 1 122 | |
| town | 1 666 | |
| energy_rating | 1 739 | Sjekk kvalitetsverdiene separat, ikke anta A–G |
| floorplans | 0 | Tilgjengelig DB-kolonne, ingen registrerte bilder |
| year_built | 0 | |
| floor_label | 0 | |
| facing_source | 0 | |
| model_name | 1 | |
| import_source_id | 0 | Kildebevis må ikke kun bygge på dette feltet |

**Feed-status:** To aktive registrerte RedSP-kilder, sist importert 18. oktober. Ved siste registrerte kildefaktaoppdatering 23. oktober rapporterte én `healthy` med 1 274 parserte referanser og én `empty_feed` (tom Kyero-feed). Ved kontrollen traff 1 256 eiendommer en fersk cache-referanse, 484 gjorde det ikke, og 18 ferske cache-referanser var ikke i eiendomsregisteret. **En cache-match er ikke en komplett tilgjengelighetsbekreftelse.** Seks timers cache-TTL betyr at disse tallene er et tidsavgrenset øyeblikksbilde. Ingen automatisk avpublisering eller statusendring på grunnlag av dette.

## 3. Feltmatrise: kilde → parser → DB → kort

Symboler: **Ja** = bekreftet i undersøkt kode; **Delvis** = felt finnes men transformasjon/lagring er begrenset; **Nei** = ikke koblet gjennom den undersøkte importveien; **Kontroller** = må inspiseres i faktisk XML/publiseringsløp.

| Opplysning / XML-eksempel | Importparser | DB-felt | Boligkort | Detaljside |
|---|---|---|---|---|
| `ref` eller `id` | Ja | `ref` | Liten referanse | Ja |
| `title/no` | Ja | `title`, `title_no` | Ja | Ja |
| `desc/no` | Ja, 300 tegn i ordinær objektflyt; full tekst via separat cache | `description`, `source_description` | Kun kort, verifiserbar ingress | Hele teksten |
| `price` | Ja | `price` | Ja, med prisforbehold | Ja |
| `town`, `location_detail`, `costa`, `province` | Delvis, sammensatt streng | `location` og separat `town` fra andre flyter | Ja | Ja |
| `type` | Ja, normalisert | `property_type` | Ja | Ja |
| `beds`, `baths` | Ja | `bedrooms`, `bathrooms` | Ja | Ja |
| `surface_area/built` | Ja | `built_area` | Ja hvis kjent | Ja |
| `surface_area/plot` | Ja | `plot_size` | Villakort/innland | Ja |
| `images/image/url` | Ja | `primary_image`, `gallery` | Hovedbilde | Galleri |
| `plans/plan/url` eller `floorplans` | Ja | `floorplans` | Evt. indikasjon | Plantegninger |
| `url` | Ja | `external_url` | Nei | Intern kilde/handling |
| `pool` | Ja | `pool` | Hvis sikkert og relevant | Ja |
| `energy_rating/consumption` | Ja | `energy_rating` | Valgfritt | Ja |
| `new_build` | Leses, brukes kun til `featured` | Ingen egen verdi gjennom denne parseren | Ønsket *hvis verifisert* | Ja |
| `location/latitude`, `longitude` | Leses, returneres ikke | Ikke bevart gjennom denne parseren | Nei | Kart |
| `distance_to_beach_m` | Leses, returneres ikke | Ikke bevart gjennom denne parseren | Kort ved nær-strand-søk | Ja |
| `tags/tag` | Leses, men ikke med i ordinært objekt; cache-parser tar med | `amenities_no` via cache/oppdatering | Maks 2–3 dokumenterte egenskaper | Fullstendig liste |
| `floor`, `level`, `floor_number` | Separat parser | `floor_label` | Penthouse/leilighet hvis kjent | Ja |
| `orientation` eller `facing` | Separat parser | `facing_source` | Sjelden | Ja |
| `property_use` mfl. | Separat parser | `usage_source` | Nei | Ja |
| Byggeår, garasje, prosjekt-/modell-/enhets-ID, levering, status | Ikke gjennomgående i denne parseren | Varierende støtte | Kun bekreftet | Ja hvis tilgjengelig |

**Kontrollpunkt:** Tabellen er ikke en fullstendig liste over alle XML-tagger leverandøren kan levere. Ingen påstand om ukjente felt før rå-XML er kontrollert. Ikke hent eller vis leverandørens private feed-URL i ansatteksport.

## 4. Anbefalt kort – beslutning som Andrea kan teste

### Zen Eco Homes – standardkort
1. Bilde, pris, boligtype/nybygg kun hvis kildeverifisert, område/sted.
2. Soverom, bad, bebygd areal; tomteareal bare der relevant.
3. Opptil tre reelle differensierende egenskaper: basseng, parkering, takterrasse, havutsikt (kun kildebelagt).
4. Statuslinje: «Sist bekreftet [dato]», eller «Tilgjengelighet må bekreftes» når den mangler.
5. CTA «Se boligen». Referansen vises diskret for kundeservice.

### Pinoso EcoLife – tomt/nybygg
1. Pris **med presis merking**: boligpris, tomtepris, eller samlet pris, etter `plot_included_in_price`, `plot_price_eur`, `pricing_source_note`. Ingen beregnet «totalpris» uten dekning for alle kostnader.
2. Tomtestørrelse før bad/energi når objektet er tomt eller byggeprosjekt.
3. Modellnavn, forventet byggetid/levering og tekniske tilkoblinger bare dersom kildeverifisert.
4. Forbehold om byggetillatelse og tomtestatus vises i detaljvisning; ingen implisitte juridiske garantier.

### Ikke på kortet
Full beskrivelse, provisjon, intern prisinformasjon, import-URL, agenters private notater, rå XML, leverandørkontakt, AI-generert påstand uten faktagrunnlag eller unødvendig overfylt fasilitetsliste.

### Visningsregel
- `null`/tomt/0 fra import der 0 er standard: vis **«Ikke oppgitt»** i detalj; skjul felt på kortet. Ikke skriv «0 soverom» uten eksplisitt kilde.
- Verifisert `false` for basseng må skilles fra ukjent.
- Intern `featured` betyr ikke dokumentert nybygg eller bekreftet tilgjengelighet.
- Ikke bruk `status=TILGJENGELIG` alene som sanntidsgaranti.
- Nettsidekort skal vise kun offentlig godkjente fakta; ansattrollen må bruke merkevareavgrenset tilgang, ikke eierens brede admin-API.

## 5. Importkvalitet og kildebevis – anbefalt rekkefølge
**Fase A: lesebasert kontroll (ingen mutasjoner).**
- Inspeksjon av aktuell XML på serversiden: feltnavn, dekning, datatyper, reelle verdier, hvilke felter som mangler. Ingen sensitive URL-er eller rå-XML til browser.
- Bygg side-ved-side diagnostikk per felt: `mottatt`, `lest`, `lagret`, `vist`, `publiserbart`. Aggregater per feed og merkevare.
- Kryssjekk et utvalg eiendommer med original XML og faktisk databaseobjekt.
- Skill `last_fetched`, `last_complete_snapshot`, `last_price_verified`, `last_status_verified`.

**Fase B: trygg datamodell og logikk.**
- Spor importkjøring, kilde-ID og stabil kilde+ref-nøkkel (unngå kollisjoner på lik referanse fra ulike leverandører).
- Historikk for pris/status og eksplisitt datakvalitetsindikator per bolig.
- `confirmed_in_feed` må bare settes fra vellykket **komplett** snapshot. `empty_feed` må ikke medføre massestatusendring.
- Separat salgsstatus og kilde-/verifiseringsstatus.
- Ingen auto-delete; revisjonslogg og manuell gjennomgang før publiseringsendring.
- Beskytt manuelle redigeringer og godkjent markedsføringstekst ved feedoppdateringer.

**Fase C: Andrea-visning og A/B-evaluering.**
- Lesebasert «Importfelt»-fane som viser dekning, eksempelverdier uten person-/leverandørhemmeligheter, og hva som er publiserbart.
- Forhåndsvis «Standard ZenEco», «Standard Pinoso» og «Kompakt mobilkort».
- Måling per variant: visning → klikk på kort → detaljvisning → reell forespørsel; GA4 `form_type` beholdes konsistent.
- Andrea kan foreslå kortfelter og rekkefølge, men ikke endre globalt datagrunnlag, økonomi eller systeminnstillinger.

## 6. Akseptansekriterier
1. Revisjon kan gjenskapes på nytt uten å endre boliger.
2. Hvert vist kortfelt kan spores til DB og pålitelig kilde; AI beskrives separat som redaksjonelt.
3. Ukjent status framstår aldri som bekreftet ledig.
4. Feilet/tom feed sletter, markerer solgt eller avpubliserer ingenting.
5. Mobilkort lesbart ved 320–390 px uten overfylt rad.
6. ZenEco/Pinoso prislogikk er forskjellig der objektet krever det.
7. Workspace/API viser ingen import credentials, provisjon eller interne felter.
8. Automatisk testing av parser, kildestatus, prisforbehold, personvern og merkeskille.

## 7. Kildesteder i kode
- `src/app/(realty)/inventory/page.tsx`: XML/CSV parsing, objekt → DB, lagerkort/redigering.
- `src/app/api/properties/import/route.ts`: XML-proxy og kildecache.
- `src/lib/realty/redsp-source-parser.ts`: fulle kildebeskrivelser, tags, etasje/orientering.
- `src/app/api/properties/route.ts`: upsert og public projection.
- `src/app/api/cron/property-feed-source-refresh/route.ts`: kontrollert kilde-refresh, ikke full katalogsynk.
- `src/app/api/workspaces/[brandKey]/properties/route.ts`: ansatts sikkerhetsavgrensede katalog.
- `src/app/api/properties/360/route.ts`: eksisterende **kjøpermatcher**, ikke full eiendomsmappe.

Dette er et beslutningsgrunnlag for implementering, **ikke** en påstand om at en ny dashboard-funksjon allerede er implementert.
