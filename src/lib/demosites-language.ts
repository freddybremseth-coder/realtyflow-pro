export const DEMO_SITE_LANGUAGES = [
  { id: "nb", label: "Norsk", nativeLabel: "Norsk", locale: "nb-NO", promptName: "Norwegian Bokmål" },
  { id: "en", label: "Engelsk", nativeLabel: "English", locale: "en-GB", promptName: "English" },
  { id: "es", label: "Spansk", nativeLabel: "Español", locale: "es-ES", promptName: "Spanish" },
  { id: "de", label: "Tysk", nativeLabel: "Deutsch", locale: "de-DE", promptName: "German" },
  { id: "fr", label: "Fransk", nativeLabel: "Français", locale: "fr-FR", promptName: "French" },
  { id: "sv", label: "Svensk", nativeLabel: "Svenska", locale: "sv-SE", promptName: "Swedish" },
  { id: "da", label: "Dansk", nativeLabel: "Dansk", locale: "da-DK", promptName: "Danish" },
] as const;

export type DemoSiteLanguage = (typeof DEMO_SITE_LANGUAGES)[number]["id"];

const ALIASES: Record<string, DemoSiteLanguage> = {
  no: "nb",
  "no-no": "nb",
  "nb-no": "nb",
  norwegian: "nb",
  norsk: "nb",
  english: "en",
  "en-gb": "en",
  "en-us": "en",
  spanish: "es",
  espanol: "es",
  español: "es",
  "es-es": "es",
  german: "de",
  deutsch: "de",
  "de-de": "de",
  french: "fr",
  francais: "fr",
  français: "fr",
  "fr-fr": "fr",
  swedish: "sv",
  svenska: "sv",
  "sv-se": "sv",
  danish: "da",
  dansk: "da",
  "da-dk": "da",
};

export function normalizeDemoSiteLanguage(value: unknown): DemoSiteLanguage {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "nb";
  if (DEMO_SITE_LANGUAGES.some((item) => item.id === raw)) return raw as DemoSiteLanguage;
  return ALIASES[raw] || "nb";
}

export function getDemoSiteLanguageConfig(value: unknown) {
  const id = normalizeDemoSiteLanguage(value);
  return DEMO_SITE_LANGUAGES.find((item) => item.id === id) || DEMO_SITE_LANGUAGES[0];
}

type DemoSiteMarketingCopy = {
  navOffer: string;
  heroBadge: string;
  heroStatusTitle: string;
  heroStatusText: string;
  heroPrimaryService: string;
  galleryEyebrow: string;
  galleryTitle: string;
  galleryText: string;
  servicesEyebrow: string;
  servicesTitle: string;
  servicesText: string;
  serviceCardText: string;
  trustEyebrow: string;
  trustTitle: string;
  trustText: string;
  offerEyebrow: string;
  offerTitle: string;
  offerText: string;
  productsTitle: string;
  pricesTitle: string;
  faqText: string;
  faqTitle: string;
  contactTitle: string;
  contactText: string;
  chatQuestion: string;
  metricServiceLabel: string;
  metricOfferLabel: string;
  metricContactLabel: string;
  proofLabel: string;
  proofItems: string[];
  processTitle: string;
  processSteps: string[];
  heroMeta: string;
  heroPanelEyebrow: string;
  heroPanelTitle: string;
};

type DemoSiteUiText = {
  navServices: string;
  navWhy: string;
  navSelected: string;
  navFaq: string;
  navContact: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  directRequest: string;
  howCanWeHelp: string;
  sendEmail: string;
  deliveredBy: string;
  demoMadeWith: string;
  packageLabel: string;
  missingLabel: string;
  leadTitle: string;
  leadIntro: string;
  leadName: string;
  leadPhone: string;
  leadEmail: string;
  leadMessage: string;
  leadSend: string;
  leadSending: string;
  leadSuccessTitle: string;
  leadSuccessText: (company: string) => string;
  leadValidation: string;
  leadError: string;
  leadDirect: string;
  chatSubtitle: string;
  chatIntro: (company: string) => string;
  chatFallback: string;
  chatNetworkError: string;
  chatTyping: string;
  chatPlaceholder: string;
  chatOpen: string;
  countdownExpired: string;
  countdownActive: (remaining: string) => string;
  countdownLeadOne: string;
  countdownLeadMany: (count: number) => string;
  countdownBuy: string;
  dayShort: string;
  hourShort: string;
  minuteShort: string;
};

const UI: Record<DemoSiteLanguage, DemoSiteUiText> = {
  nb: {
    navServices: "Tjenester", navWhy: "Hvorfor oss", navSelected: "Utvalgt", navFaq: "FAQ", navContact: "Kontakt",
    contact: "Kontakt", phone: "Telefon", email: "E-post", address: "Adresse", directRequest: "Direkte forespørsel", howCanWeHelp: "Hva kan vi hjelpe med?", sendEmail: "Send e-post", deliveredBy: "Nettside levert av", demoMadeWith: "Demo laget med", packageLabel: "Pakke", missingLabel: "Mangler",
    leadTitle: "Send oss en melding", leadIntro: "Vi svarer så raskt vi kan.", leadName: "Navn *", leadPhone: "Telefon", leadEmail: "E-post", leadMessage: "Hva kan vi hjelpe deg med?", leadSend: "Send melding", leadSending: "Sender…", leadSuccessTitle: "Takk for henvendelsen!", leadSuccessText: (company) => `${company} har fått meldingen din og tar kontakt så snart som mulig.`, leadValidation: "Fyll inn navn og e-post eller telefon.", leadError: "Kunne ikke sende henvendelsen.", leadDirect: "Du kan også ringe oss direkte — se kontaktinformasjonen.",
    chatSubtitle: "AI-resepsjonist · svarer døgnet rundt", chatIntro: (company) => `Hei! 👋 Jeg kan svare på spørsmål om tjenester, priser og kontakt hos ${company}. Hva lurer du på?`, chatFallback: "Beklager, prøv igjen — eller bruk kontaktskjemaet.", chatNetworkError: "Beklager, forbindelsen ble brutt et øyeblikk. Prøv igjen!", chatTyping: "skriver…", chatPlaceholder: "Skriv et spørsmål…", chatOpen: "Spør oss",
    countdownExpired: "Demoperioden er utløpt — bestill for å beholde siden", countdownActive: (remaining) => `Demosiden din er aktiv i ${remaining} til`, countdownLeadOne: "1 henvendelse mottatt via denne siden", countdownLeadMany: (count) => `${count} henvendelser mottatt via denne siden`, countdownBuy: "Bestill siden nå", dayShort: "d", hourShort: "t", minuteShort: "min",
  },
  en: {
    navServices: "Services", navWhy: "Why us", navSelected: "Selected", navFaq: "FAQ", navContact: "Contact",
    contact: "Contact", phone: "Phone", email: "Email", address: "Address", directRequest: "Direct enquiry", howCanWeHelp: "How can we help?", sendEmail: "Send email", deliveredBy: "Website delivered by", demoMadeWith: "Demo created with", packageLabel: "Package", missingLabel: "Missing",
    leadTitle: "Send us a message", leadIntro: "We will get back to you as soon as we can.", leadName: "Name *", leadPhone: "Phone", leadEmail: "Email", leadMessage: "How can we help?", leadSend: "Send message", leadSending: "Sending…", leadSuccessTitle: "Thanks for your message!", leadSuccessText: (company) => `${company} has received your message and will get back to you as soon as possible.`, leadValidation: "Enter your name and either an email address or phone number.", leadError: "Could not send your message.", leadDirect: "You can also call us directly — see the contact details.",
    chatSubtitle: "AI receptionist · available around the clock", chatIntro: (company) => `Hi! 👋 I can answer questions about services, pricing and how to contact ${company}. How can I help?`, chatFallback: "Sorry, please try again — or use the contact form.", chatNetworkError: "Sorry, the connection dropped for a moment. Please try again!", chatTyping: "typing…", chatPlaceholder: "Ask a question…", chatOpen: "Ask us",
    countdownExpired: "The demo period has ended — order the site to keep it", countdownActive: (remaining) => `Your demo site is active for another ${remaining}`, countdownLeadOne: "1 enquiry received through this site", countdownLeadMany: (count) => `${count} enquiries received through this site`, countdownBuy: "Order the site", dayShort: "d", hourShort: "h", minuteShort: "min",
  },
  es: {
    navServices: "Servicios", navWhy: "Por qué nosotros", navSelected: "Destacado", navFaq: "Preguntas", navContact: "Contacto",
    contact: "Contacto", phone: "Teléfono", email: "Email", address: "Dirección", directRequest: "Consulta directa", howCanWeHelp: "¿En qué podemos ayudarte?", sendEmail: "Enviar email", deliveredBy: "Web creada por", demoMadeWith: "Demo creada con", packageLabel: "Paquete", missingLabel: "Falta",
    leadTitle: "Envíanos un mensaje", leadIntro: "Te responderemos lo antes posible.", leadName: "Nombre *", leadPhone: "Teléfono", leadEmail: "Email", leadMessage: "¿En qué podemos ayudarte?", leadSend: "Enviar mensaje", leadSending: "Enviando…", leadSuccessTitle: "¡Gracias por tu mensaje!", leadSuccessText: (company) => `${company} ha recibido tu mensaje y se pondrá en contacto contigo lo antes posible.`, leadValidation: "Introduce tu nombre y un email o teléfono.", leadError: "No se pudo enviar el mensaje.", leadDirect: "También puedes llamarnos directamente — consulta los datos de contacto.",
    chatSubtitle: "Recepcionista IA · disponible 24/7", chatIntro: (company) => `¡Hola! 👋 Puedo responder preguntas sobre servicios, precios y contacto de ${company}. ¿En qué puedo ayudarte?`, chatFallback: "Lo siento, inténtalo de nuevo o utiliza el formulario de contacto.", chatNetworkError: "Lo siento, se perdió la conexión por un momento. ¡Inténtalo de nuevo!", chatTyping: "escribiendo…", chatPlaceholder: "Escribe una pregunta…", chatOpen: "Pregúntanos",
    countdownExpired: "La demo ha caducado — contrata la web para conservarla", countdownActive: (remaining) => `Tu web demo seguirá activa durante ${remaining}`, countdownLeadOne: "1 consulta recibida a través de esta web", countdownLeadMany: (count) => `${count} consultas recibidas a través de esta web`, countdownBuy: "Contratar la web", dayShort: "d", hourShort: "h", minuteShort: "min",
  },
  de: {
    navServices: "Leistungen", navWhy: "Warum wir", navSelected: "Ausgewählt", navFaq: "FAQ", navContact: "Kontakt",
    contact: "Kontakt", phone: "Telefon", email: "E-Mail", address: "Adresse", directRequest: "Direkte Anfrage", howCanWeHelp: "Wie können wir helfen?", sendEmail: "E-Mail senden", deliveredBy: "Website bereitgestellt von", demoMadeWith: "Demo erstellt mit", packageLabel: "Paket", missingLabel: "Fehlt",
    leadTitle: "Nachricht senden", leadIntro: "Wir melden uns so schnell wie möglich.", leadName: "Name *", leadPhone: "Telefon", leadEmail: "E-Mail", leadMessage: "Wie können wir helfen?", leadSend: "Nachricht senden", leadSending: "Wird gesendet…", leadSuccessTitle: "Vielen Dank für Ihre Nachricht!", leadSuccessText: (company) => `${company} hat Ihre Nachricht erhalten und meldet sich so schnell wie möglich.`, leadValidation: "Bitte Name und E-Mail-Adresse oder Telefonnummer eingeben.", leadError: "Die Nachricht konnte nicht gesendet werden.", leadDirect: "Sie können uns auch direkt anrufen — siehe Kontaktdaten.",
    chatSubtitle: "KI-Rezeption · rund um die Uhr erreichbar", chatIntro: (company) => `Hallo! 👋 Ich beantworte Fragen zu Leistungen, Preisen und Kontakt bei ${company}. Wie kann ich helfen?`, chatFallback: "Entschuldigung, bitte erneut versuchen oder das Kontaktformular nutzen.", chatNetworkError: "Entschuldigung, die Verbindung wurde kurz unterbrochen. Bitte erneut versuchen!", chatTyping: "schreibt…", chatPlaceholder: "Frage eingeben…", chatOpen: "Fragen",
    countdownExpired: "Der Demozeitraum ist beendet — bestellen Sie die Website, um sie zu behalten", countdownActive: (remaining) => `Ihre Demo-Website ist noch ${remaining} aktiv`, countdownLeadOne: "1 Anfrage über diese Website erhalten", countdownLeadMany: (count) => `${count} Anfragen über diese Website erhalten`, countdownBuy: "Website bestellen", dayShort: "T", hourShort: "Std", minuteShort: "Min",
  },
  fr: {
    navServices: "Services", navWhy: "Pourquoi nous", navSelected: "Sélection", navFaq: "FAQ", navContact: "Contact",
    contact: "Contact", phone: "Téléphone", email: "E-mail", address: "Adresse", directRequest: "Demande directe", howCanWeHelp: "Comment pouvons-nous vous aider ?", sendEmail: "Envoyer un e-mail", deliveredBy: "Site réalisé par", demoMadeWith: "Démo créée avec", packageLabel: "Forfait", missingLabel: "Manquant",
    leadTitle: "Envoyez-nous un message", leadIntro: "Nous vous répondrons dès que possible.", leadName: "Nom *", leadPhone: "Téléphone", leadEmail: "E-mail", leadMessage: "Comment pouvons-nous vous aider ?", leadSend: "Envoyer", leadSending: "Envoi…", leadSuccessTitle: "Merci pour votre message !", leadSuccessText: (company) => `${company} a bien reçu votre message et vous répondra dès que possible.`, leadValidation: "Indiquez votre nom et une adresse e-mail ou un numéro de téléphone.", leadError: "Impossible d’envoyer le message.", leadDirect: "Vous pouvez aussi nous appeler directement — voir les coordonnées.",
    chatSubtitle: "Réception IA · disponible 24h/24", chatIntro: (company) => `Bonjour ! 👋 Je peux répondre à vos questions sur les services, les tarifs et le contact de ${company}. Comment puis-je vous aider ?`, chatFallback: "Désolé, réessayez ou utilisez le formulaire de contact.", chatNetworkError: "Désolé, la connexion a été interrompue un instant. Réessayez !", chatTyping: "écrit…", chatPlaceholder: "Posez une question…", chatOpen: "Nous contacter",
    countdownExpired: "La période de démonstration est terminée — commandez le site pour le conserver", countdownActive: (remaining) => `Votre site de démonstration reste actif pendant ${remaining}`, countdownLeadOne: "1 demande reçue via ce site", countdownLeadMany: (count) => `${count} demandes reçues via ce site`, countdownBuy: "Commander le site", dayShort: "j", hourShort: "h", minuteShort: "min",
  },
  sv: {
    navServices: "Tjänster", navWhy: "Varför oss", navSelected: "Utvalt", navFaq: "FAQ", navContact: "Kontakt",
    contact: "Kontakt", phone: "Telefon", email: "E-post", address: "Adress", directRequest: "Direkt förfrågan", howCanWeHelp: "Vad kan vi hjälpa till med?", sendEmail: "Skicka e-post", deliveredBy: "Webbplats levererad av", demoMadeWith: "Demo skapad med", packageLabel: "Paket", missingLabel: "Saknas",
    leadTitle: "Skicka ett meddelande", leadIntro: "Vi återkommer så snart vi kan.", leadName: "Namn *", leadPhone: "Telefon", leadEmail: "E-post", leadMessage: "Vad kan vi hjälpa till med?", leadSend: "Skicka meddelande", leadSending: "Skickar…", leadSuccessTitle: "Tack för ditt meddelande!", leadSuccessText: (company) => `${company} har fått ditt meddelande och återkommer så snart som möjligt.`, leadValidation: "Fyll i namn och e-post eller telefonnummer.", leadError: "Det gick inte att skicka meddelandet.", leadDirect: "Du kan också ringa oss direkt — se kontaktuppgifterna.",
    chatSubtitle: "AI-receptionist · tillgänglig dygnet runt", chatIntro: (company) => `Hej! 👋 Jag kan svara på frågor om tjänster, priser och kontakt hos ${company}. Vad undrar du?`, chatFallback: "Förlåt, försök igen eller använd kontaktformuläret.", chatNetworkError: "Förlåt, anslutningen bröts ett ögonblick. Försök igen!", chatTyping: "skriver…", chatPlaceholder: "Skriv en fråga…", chatOpen: "Fråga oss",
    countdownExpired: "Demoperioden har gått ut — beställ sidan för att behålla den", countdownActive: (remaining) => `Din demosida är aktiv i ytterligare ${remaining}`, countdownLeadOne: "1 förfrågan mottagen via sidan", countdownLeadMany: (count) => `${count} förfrågningar mottagna via sidan`, countdownBuy: "Beställ sidan", dayShort: "d", hourShort: "h", minuteShort: "min",
  },
  da: {
    navServices: "Ydelser", navWhy: "Hvorfor os", navSelected: "Udvalgt", navFaq: "FAQ", navContact: "Kontakt",
    contact: "Kontakt", phone: "Telefon", email: "E-mail", address: "Adresse", directRequest: "Direkte forespørgsel", howCanWeHelp: "Hvad kan vi hjælpe med?", sendEmail: "Send e-mail", deliveredBy: "Website leveret af", demoMadeWith: "Demo lavet med", packageLabel: "Pakke", missingLabel: "Mangler",
    leadTitle: "Send os en besked", leadIntro: "Vi vender tilbage så hurtigt som muligt.", leadName: "Navn *", leadPhone: "Telefon", leadEmail: "E-mail", leadMessage: "Hvad kan vi hjælpe med?", leadSend: "Send besked", leadSending: "Sender…", leadSuccessTitle: "Tak for din besked!", leadSuccessText: (company) => `${company} har modtaget din besked og vender tilbage så hurtigt som muligt.`, leadValidation: "Udfyld navn og e-mail eller telefonnummer.", leadError: "Beskeden kunne ikke sendes.", leadDirect: "Du kan også ringe direkte — se kontaktoplysningerne.",
    chatSubtitle: "AI-receptionist · tilgængelig døgnet rundt", chatIntro: (company) => `Hej! 👋 Jeg kan svare på spørgsmål om ydelser, priser og kontakt hos ${company}. Hvad kan jeg hjælpe med?`, chatFallback: "Beklager, prøv igen eller brug kontaktformularen.", chatNetworkError: "Beklager, forbindelsen blev afbrudt et øjeblik. Prøv igen!", chatTyping: "skriver…", chatPlaceholder: "Skriv et spørgsmål…", chatOpen: "Spørg os",
    countdownExpired: "Demoperioden er udløbet — bestil siden for at beholde den", countdownActive: (remaining) => `Din demoside er aktiv i yderligere ${remaining}`, countdownLeadOne: "1 forespørgsel modtaget via siden", countdownLeadMany: (count) => `${count} forespørgsler modtaget via siden`, countdownBuy: "Bestil siden", dayShort: "d", hourShort: "t", minuteShort: "min",
  },
};

export function getDemoSiteUiText(value: unknown) {
  return UI[normalizeDemoSiteLanguage(value)];
}

const GENERIC_MARKETING: Record<DemoSiteLanguage, (company: string) => DemoSiteMarketingCopy> = {
  nb: (company) => ({
    navOffer: "Tilbud", heroBadge: "Moderne lokal bedrift", heroStatusTitle: "Klar for neste steg", heroStatusText: "Tydelig informasjon og enkel kontakt.", heroPrimaryService: "Personlig hjelp",
    galleryEyebrow: "Profil", galleryTitle: `Et tydeligere førsteinntrykk for ${company}`, galleryText: "Gode bilder gjør bedriften konkret og lett å kjenne igjen.",
    servicesEyebrow: "Tjenester", servicesTitle: "Dette kan vi hjelpe med", servicesText: "Se tjenestene og finn riktig vei videre.", serviceCardText: "Tydelig tjeneste med enkel vei til spørsmål eller tilbud.",
    trustEyebrow: "Trygghet", trustTitle: `Derfor velger kunder ${company}`, trustText: "Ryddig informasjon og lav terskel for å ta kontakt.",
    offerEyebrow: "Muligheter", offerTitle: "Tydelige valg før kontakt", offerText: "Se løsninger, priser eller pakker før du tar neste steg.", productsTitle: "Løsninger", pricesTitle: "Pris og pakker",
    faqText: "Korte svar på vanlige spørsmål.", faqTitle: "Vanlige spørsmål", contactTitle: `Klar for neste steg med ${company}?`, contactText: "Fortell kort hva du trenger, så får du et tydelig svar tilbake.",
    chatQuestion: "Hva kan vi hjelpe med?", metricServiceLabel: "Tjenester", metricOfferLabel: "Tilbud", metricContactLabel: "Kontakt", proofLabel: "Trygghet", proofItems: ["Tydelig kommunikasjon", "Enkel kontakt", "Ryddig prosess"], processTitle: "Slik går du videre", processSteps: ["Velg det du trenger", "Send en kort forespørsel", "Få svar og neste steg"],
    heroMeta: "Klar side", heroPanelEyebrow: "Fokus", heroPanelTitle: "Neste steg",
  }),
  en: (company) => ({
    navOffer: "Options", heroBadge: "Modern local business", heroStatusTitle: "Ready for the next step", heroStatusText: "Clear information and an easy way to get in touch.", heroPrimaryService: "Personal help",
    galleryEyebrow: "Profile", galleryTitle: `A stronger first impression for ${company}`, galleryText: "Strong imagery makes the business clear, memorable and easy to trust.",
    servicesEyebrow: "Services", servicesTitle: "How we can help", servicesText: "Explore the services and choose the right next step.", serviceCardText: "A clear service with a simple path to questions, a quote or booking.",
    trustEyebrow: "Confidence", trustTitle: `Why customers choose ${company}`, trustText: "Clear information and a low-friction way to get in touch.",
    offerEyebrow: "Options", offerTitle: "Clear choices before you contact us", offerText: "Review solutions, pricing or packages before taking the next step.", productsTitle: "Solutions", pricesTitle: "Pricing and packages",
    faqText: "Short answers to common questions.", faqTitle: "Frequently asked questions", contactTitle: `Ready to take the next step with ${company}?`, contactText: "Tell us briefly what you need and we will help you with the next step.",
    chatQuestion: "How can we help?", metricServiceLabel: "Services", metricOfferLabel: "Options", metricContactLabel: "Contact", proofLabel: "Confidence", proofItems: ["Clear communication", "Easy contact", "Simple process"], processTitle: "How it works", processSteps: ["Choose what you need", "Send a short enquiry", "Get a clear next step"],
    heroMeta: "Ready", heroPanelEyebrow: "Focus", heroPanelTitle: "Next step",
  }),
  es: (company) => ({
    navOffer: "Opciones", heroBadge: "Negocio local moderno", heroStatusTitle: "Listo para el siguiente paso", heroStatusText: "Información clara y contacto sencillo.", heroPrimaryService: "Atención personal",
    galleryEyebrow: "Perfil", galleryTitle: `Una primera impresión más fuerte para ${company}`, galleryText: "Las buenas imágenes hacen que el negocio sea reconocible y fácil de entender.",
    servicesEyebrow: "Servicios", servicesTitle: "Cómo podemos ayudarte", servicesText: "Consulta los servicios y elige el siguiente paso.", serviceCardText: "Un servicio claro con acceso sencillo a preguntas, presupuesto o reserva.",
    trustEyebrow: "Confianza", trustTitle: `Por qué los clientes eligen ${company}`, trustText: "Información clara y una forma sencilla de contactar.",
    offerEyebrow: "Opciones", offerTitle: "Opciones claras antes de contactar", offerText: "Consulta soluciones, precios o paquetes antes de continuar.", productsTitle: "Soluciones", pricesTitle: "Precios y paquetes",
    faqText: "Respuestas breves a preguntas habituales.", faqTitle: "Preguntas frecuentes", contactTitle: `¿Listo para dar el siguiente paso con ${company}?`, contactText: "Cuéntanos brevemente qué necesitas y te indicaremos el siguiente paso.",
    chatQuestion: "¿En qué podemos ayudarte?", metricServiceLabel: "Servicios", metricOfferLabel: "Opciones", metricContactLabel: "Contacto", proofLabel: "Confianza", proofItems: ["Comunicación clara", "Contacto sencillo", "Proceso ordenado"], processTitle: "Cómo funciona", processSteps: ["Elige lo que necesitas", "Envía una consulta breve", "Recibe el siguiente paso"],
    heroMeta: "Listo", heroPanelEyebrow: "Enfoque", heroPanelTitle: "Siguiente paso",
  }),
  de: (company) => ({
    navOffer: "Optionen", heroBadge: "Modernes lokales Unternehmen", heroStatusTitle: "Bereit für den nächsten Schritt", heroStatusText: "Klare Informationen und einfache Kontaktaufnahme.", heroPrimaryService: "Persönliche Unterstützung",
    galleryEyebrow: "Profil", galleryTitle: `Ein stärkerer erster Eindruck für ${company}`, galleryText: "Gute Bilder machen das Unternehmen greifbar, wiedererkennbar und vertrauenswürdig.",
    servicesEyebrow: "Leistungen", servicesTitle: "Wie wir helfen können", servicesText: "Leistungen ansehen und den passenden nächsten Schritt wählen.", serviceCardText: "Klare Leistung mit einfachem Weg zu Fragen, Angebot oder Termin.",
    trustEyebrow: "Vertrauen", trustTitle: `Warum Kunden ${company} wählen`, trustText: "Klare Informationen und ein einfacher Weg zur Kontaktaufnahme.",
    offerEyebrow: "Optionen", offerTitle: "Klare Auswahl vor der Kontaktaufnahme", offerText: "Lösungen, Preise oder Pakete ansehen und dann entscheiden.", productsTitle: "Lösungen", pricesTitle: "Preise und Pakete",
    faqText: "Kurze Antworten auf häufige Fragen.", faqTitle: "Häufige Fragen", contactTitle: `Bereit für den nächsten Schritt mit ${company}?`, contactText: "Beschreiben Sie kurz Ihren Bedarf und Sie erhalten einen klaren nächsten Schritt.",
    chatQuestion: "Wie können wir helfen?", metricServiceLabel: "Leistungen", metricOfferLabel: "Optionen", metricContactLabel: "Kontakt", proofLabel: "Vertrauen", proofItems: ["Klare Kommunikation", "Einfacher Kontakt", "Übersichtlicher Ablauf"], processTitle: "So funktioniert es", processSteps: ["Bedarf auswählen", "Kurze Anfrage senden", "Klare Rückmeldung erhalten"],
    heroMeta: "Bereit", heroPanelEyebrow: "Fokus", heroPanelTitle: "Nächster Schritt",
  }),
  fr: (company) => ({
    navOffer: "Options", heroBadge: "Entreprise locale moderne", heroStatusTitle: "Prêt pour la prochaine étape", heroStatusText: "Des informations claires et un contact simple.", heroPrimaryService: "Aide personnalisée",
    galleryEyebrow: "Profil", galleryTitle: `Une meilleure première impression pour ${company}`, galleryText: "De bonnes images rendent l’entreprise concrète, reconnaissable et rassurante.",
    servicesEyebrow: "Services", servicesTitle: "Comment nous pouvons vous aider", servicesText: "Découvrez les services et choisissez la prochaine étape.", serviceCardText: "Un service clair avec un accès simple aux questions, devis ou réservations.",
    trustEyebrow: "Confiance", trustTitle: `Pourquoi les clients choisissent ${company}`, trustText: "Des informations claires et un moyen simple de prendre contact.",
    offerEyebrow: "Options", offerTitle: "Des choix clairs avant de nous contacter", offerText: "Consultez les solutions, tarifs ou forfaits avant de continuer.", productsTitle: "Solutions", pricesTitle: "Tarifs et forfaits",
    faqText: "Des réponses courtes aux questions fréquentes.", faqTitle: "Questions fréquentes", contactTitle: `Prêt à avancer avec ${company} ?`, contactText: "Expliquez brièvement votre besoin et nous vous indiquerons la prochaine étape.",
    chatQuestion: "Comment pouvons-nous vous aider ?", metricServiceLabel: "Services", metricOfferLabel: "Options", metricContactLabel: "Contact", proofLabel: "Confiance", proofItems: ["Communication claire", "Contact simple", "Processus fluide"], processTitle: "Comment ça marche", processSteps: ["Choisissez votre besoin", "Envoyez une demande courte", "Recevez la prochaine étape"],
    heroMeta: "Prêt", heroPanelEyebrow: "Priorité", heroPanelTitle: "Prochaine étape",
  }),
  sv: (company) => ({
    navOffer: "Alternativ", heroBadge: "Modernt lokalt företag", heroStatusTitle: "Redo för nästa steg", heroStatusText: "Tydlig information och enkel kontakt.", heroPrimaryService: "Personlig hjälp",
    galleryEyebrow: "Profil", galleryTitle: `Ett tydligare första intryck för ${company}`, galleryText: "Bra bilder gör företaget konkret, igenkännbart och lätt att lita på.",
    servicesEyebrow: "Tjänster", servicesTitle: "Så kan vi hjälpa", servicesText: "Se tjänsterna och välj rätt nästa steg.", serviceCardText: "Tydlig tjänst med enkel väg till frågor, offert eller bokning.",
    trustEyebrow: "Trygghet", trustTitle: `Därför väljer kunder ${company}`, trustText: "Tydlig information och låg tröskel för att ta kontakt.",
    offerEyebrow: "Alternativ", offerTitle: "Tydliga val före kontakt", offerText: "Se lösningar, priser eller paket innan du går vidare.", productsTitle: "Lösningar", pricesTitle: "Pris och paket",
    faqText: "Korta svar på vanliga frågor.", faqTitle: "Vanliga frågor", contactTitle: `Redo för nästa steg med ${company}?`, contactText: "Berätta kort vad du behöver så hjälper vi dig vidare.",
    chatQuestion: "Vad kan vi hjälpa till med?", metricServiceLabel: "Tjänster", metricOfferLabel: "Alternativ", metricContactLabel: "Kontakt", proofLabel: "Trygghet", proofItems: ["Tydlig kommunikation", "Enkel kontakt", "Smidig process"], processTitle: "Så fungerar det", processSteps: ["Välj vad du behöver", "Skicka en kort förfrågan", "Få ett tydligt nästa steg"],
    heroMeta: "Redo", heroPanelEyebrow: "Fokus", heroPanelTitle: "Nästa steg",
  }),
  da: (company) => ({
    navOffer: "Muligheder", heroBadge: "Moderne lokal virksomhed", heroStatusTitle: "Klar til næste skridt", heroStatusText: "Tydelig information og nem kontakt.", heroPrimaryService: "Personlig hjælp",
    galleryEyebrow: "Profil", galleryTitle: `Et tydeligere førstehåndsindtryk for ${company}`, galleryText: "Gode billeder gør virksomheden konkret, genkendelig og tryg at kontakte.",
    servicesEyebrow: "Ydelser", servicesTitle: "Sådan kan vi hjælpe", servicesText: "Se ydelserne og vælg det rigtige næste skridt.", serviceCardText: "Tydelig ydelse med enkel vej til spørgsmål, tilbud eller booking.",
    trustEyebrow: "Tryghed", trustTitle: `Derfor vælger kunder ${company}`, trustText: "Tydelig information og lav tærskel for at tage kontakt.",
    offerEyebrow: "Muligheder", offerTitle: "Tydelige valg før kontakt", offerText: "Se løsninger, priser eller pakker før du går videre.", productsTitle: "Løsninger", pricesTitle: "Pris og pakker",
    faqText: "Korte svar på almindelige spørgsmål.", faqTitle: "Ofte stillede spørgsmål", contactTitle: `Klar til næste skridt med ${company}?`, contactText: "Fortæl kort hvad du har brug for, så hjælper vi dig videre.",
    chatQuestion: "Hvad kan vi hjælpe med?", metricServiceLabel: "Ydelser", metricOfferLabel: "Muligheder", metricContactLabel: "Kontakt", proofLabel: "Tryghed", proofItems: ["Tydelig kommunikation", "Nem kontakt", "Enkel proces"], processTitle: "Sådan fungerer det", processSteps: ["Vælg hvad du har brug for", "Send en kort forespørgsel", "Få et tydeligt næste skridt"],
    heroMeta: "Klar", heroPanelEyebrow: "Fokus", heroPanelTitle: "Næste skridt",
  }),
};

export function getDemoSiteMarketingCopy(value: unknown, companyName: string) {
  return GENERIC_MARKETING[normalizeDemoSiteLanguage(value)](companyName);
}
