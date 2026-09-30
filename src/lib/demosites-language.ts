export const DEMO_SITE_LANGUAGES = [
  { id: "nb", label: "Norsk", nativeLabel: "Norsk", locale: "nb-NO", promptName: "Norwegian Bokmål" },
  { id: "en", label: "Engelsk", nativeLabel: "English", locale: "en-GB", promptName: "English" },
  { id: "es", label: "Spansk", nativeLabel: "Español", locale: "es-ES", promptName: "Spanish" },
  { id: "de", label: "Tysk", nativeLabel: "Deutsch", locale: "de-DE", promptName: "German" },
  { id: "fr", label: "Fransk", nativeLabel: "Français", locale: "fr-FR", promptName: "French" },
  { id: "ru", label: "Russisk", nativeLabel: "Русский", locale: "ru-RU", promptName: "Russian" },
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
  russian: "ru",
  русский: "ru",
  "ru-ru": "ru",
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
  ru: {
    navServices: "Услуги", navWhy: "Почему мы", navSelected: "Избранное", navFaq: "FAQ", navContact: "Контакты",
    contact: "Контакты", phone: "Телефон", email: "E-mail", address: "Адрес", directRequest: "Прямой запрос", howCanWeHelp: "Чем мы можем помочь?", sendEmail: "Отправить e-mail", deliveredBy: "Сайт создан", demoMadeWith: "Демо создано с", packageLabel: "Пакет", missingLabel: "Нет данных",
    leadTitle: "Отправьте нам сообщение", leadIntro: "Мы ответим как можно скорее.", leadName: "Имя *", leadPhone: "Телефон", leadEmail: "E-mail", leadMessage: "Чем мы можем помочь?", leadSend: "Отправить", leadSending: "Отправка…", leadSuccessTitle: "Спасибо за сообщение!", leadSuccessText: (company) => `${company} получил ваше сообщение и свяжется с вами как можно скорее.`, leadValidation: "Укажите имя и e-mail или номер телефона.", leadError: "Не удалось отправить сообщение.", leadDirect: "Вы также можете позвонить нам напрямую — контакты указаны на странице.",
    chatSubtitle: "ИИ-администратор · доступен круглосуточно", chatIntro: (company) => `Здравствуйте! 👋 Я могу ответить на вопросы об услугах, ценах и контактах ${company}. Чем могу помочь?`, chatFallback: "Извините, попробуйте ещё раз или воспользуйтесь формой связи.", chatNetworkError: "Соединение на мгновение прервалось. Попробуйте ещё раз!", chatTyping: "печатает…", chatPlaceholder: "Задайте вопрос…", chatOpen: "Спросить",
    countdownExpired: "Срок демо истёк — закажите сайт, чтобы сохранить его", countdownActive: (remaining) => `Демо-сайт будет активен ещё ${remaining}`, countdownLeadOne: "1 заявка получена через этот сайт", countdownLeadMany: (count) => `${count} заявок получено через этот сайт`, countdownBuy: "Заказать сайт", dayShort: "д", hourShort: "ч", minuteShort: "мин",
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
  ru: (company) => ({
    navOffer: "Варианты", heroBadge: "Современный локальный бизнес", heroStatusTitle: "Готово к следующему шагу", heroStatusText: "Понятная информация и простой способ связаться.", heroPrimaryService: "Персональная помощь",
    galleryEyebrow: "Профиль", galleryTitle: `Более сильное первое впечатление для ${company}`, galleryText: "Качественные изображения делают бизнес понятным, узнаваемым и вызывают доверие.",
    servicesEyebrow: "Услуги", servicesTitle: "Чем мы можем помочь", servicesText: "Посмотрите услуги и выберите подходящий следующий шаг.", serviceCardText: "Понятная услуга с простым переходом к вопросу, расчёту или бронированию.",
    trustEyebrow: "Доверие", trustTitle: `Почему клиенты выбирают ${company}`, trustText: "Понятная информация и простой способ связаться.",
    offerEyebrow: "Варианты", offerTitle: "Понятный выбор до обращения", offerText: "Посмотрите решения, цены или пакеты перед следующим шагом.", productsTitle: "Решения", pricesTitle: "Цены и пакеты",
    faqText: "Короткие ответы на частые вопросы.", faqTitle: "Частые вопросы", contactTitle: `Готовы сделать следующий шаг с ${company}?`, contactText: "Кратко опишите, что вам нужно, и мы подскажем следующий шаг.",
    chatQuestion: "Чем мы можем помочь?", metricServiceLabel: "Услуги", metricOfferLabel: "Варианты", metricContactLabel: "Контакты", proofLabel: "Доверие", proofItems: ["Понятная коммуникация", "Простой контакт", "Прозрачный процесс"], processTitle: "Как это работает", processSteps: ["Выберите нужную услугу", "Отправьте короткий запрос", "Получите понятный следующий шаг"],
    heroMeta: "Готово", heroPanelEyebrow: "Фокус", heroPanelTitle: "Следующий шаг",
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


export type DemoSiteFollowupKind = "ready" | "midway" | "final";

export type DemoSiteClaimCopy = {
  title: (company: string) => string;
  intro: string;
  expires: string;
  expired: string;
  statusTitle: string;
  paymentSuccess: string;
  paymentCancelled: string;
  status: string;
  payment: string;
  package: string;
  industry: string;
  website: string;
  nextStep: string;
  steps: string[];
  keepTitle: string;
  keepBody: (packageLabel: string) => string;
  viewDemo: string;
  bookCall: string;
  includedTitle: string;
  includedItems: string[];
  questionText: string;
  goToDemoSites: string;
  notSet: string;
  paid: string;
  pending: string;
  unpaid: string;
  claimed: string;
  approved: string;
  live: string;
  temporaryDemo: string;
  checkoutPaid: string;
  checkoutExpired: string;
  checkoutReserved: string;
  seoTitle: string;
  seoPrice: string;
  seoDescription: string;
  checkoutLoading: string;
  checkoutButton: string;
  checkoutSecurity: string;
  checkoutError: string;
  checkoutMissingUrl: string;
};

const CLAIM: Record<DemoSiteLanguage, DemoSiteClaimCopy> = {
  nb: {
    title: (company) => `Gjør prøvesiden til den offisielle nettsiden for ${company}`,
    intro: "Betal oppstart + første måned nå, så publiserer vi siden med hosting, SSL og drift — prøvesiden du allerede har sett blir din.",
    expires: "Utløper", expired: "Denne demoen er utløpt.", statusTitle: "Demo-status",
    paymentSuccess: "Betaling er sendt til bekreftelse. Når Stripe bekrefter betalingen, starter publisering og oppsett.",
    paymentCancelled: "Betalingen ble avbrutt. Du kan starte betalingen igjen når du er klar.",
    status: "Status", payment: "Betaling", package: "Pakke", industry: "Bransje", website: "Eksisterende nettside",
    nextStep: "Neste steg", steps: ["Betal trygt med kort via Stripe — oppstart + første måned i én betaling.", "Når Stripe bekrefter betalingen, publiseres siden og oppsettet starter.", "Månedlig drift fornyes automatisk. Ingen bindingstid utover inneværende måned."],
    keepTitle: "Vil du beholde siden?", keepBody: (packageLabel) => `${packageLabel}. Du betaler nå og siden blir din — vi publiserer og drifter den for deg.`,
    viewDemo: "Se prøvesiden", bookCall: "Book 30 min gratis analysesamtale", includedTitle: "Inkludert som DemoSites-kunde:",
    includedItems: ["30 min gratis samtale — vi analyserer bedriften og foreslår tilpasninger", "60 % rabatt på utviklertimer: 596 kr/t (ordinært 1 490 kr/t)", "SEO & Google-optimalisering kan legges til for 490 kr (engangsbeløp)"],
    questionText: "Spørsmål før du bestiller? Send oss en e-post på post@chatgenius.pro.", goToDemoSites: "Les om DemoSites", notSet: "Ikke satt",
    paid: "Betalt", pending: "Venter på betaling", unpaid: "Ikke betalt", claimed: "Reservert av kunde", approved: "Godkjent", live: "Live", temporaryDemo: "Midlertidig demo",
    checkoutPaid: "Betaling mottatt! Vi klargjør og publiserer siden din.", checkoutExpired: "Denne prøvesiden er utløpt. Kontakt ChatGenius, så åpner vi den igjen.", checkoutReserved: "Siden er reservert. Du kan fullføre betaling når du er klar.",
    seoTitle: "SEO & Google-optimalisering", seoPrice: "+490 kr (engangsbeløp)", seoDescription: "Søkeordsoptimalisering, Google Business-profil og synlighet i lokale søk — satt opp én gang, virker videre.",
    checkoutLoading: "Åpner sikker betaling...", checkoutButton: "Bestill og betal nå", checkoutSecurity: "Sikker betaling via Stripe · Oppstart + første måned · Ingen bindingstid utover måneden", checkoutError: "Kunne ikke starte betalingen.", checkoutMissingUrl: "Betalingsleverandøren returnerte ingen checkout-lenke.",
  },
  en: {
    title: (company) => `Make the demo the official website for ${company}`,
    intro: "Pay the setup fee and first month now, and we will publish the site with hosting, SSL and ongoing operation — the demo you have already seen becomes yours.",
    expires: "Expires", expired: "This demo has expired.", statusTitle: "Demo status",
    paymentSuccess: "Your payment has been sent for confirmation. Publishing and setup start once Stripe confirms it.",
    paymentCancelled: "The payment was cancelled. You can start checkout again whenever you are ready.",
    status: "Status", payment: "Payment", package: "Package", industry: "Industry", website: "Existing website",
    nextStep: "Next step", steps: ["Pay securely by card through Stripe — setup + first month in one checkout.", "Once Stripe confirms payment, publishing and setup start.", "Monthly operation renews automatically. There is no commitment beyond the current month."],
    keepTitle: "Would you like to keep the site?", keepBody: (packageLabel) => `${packageLabel}. Pay now and the site becomes yours — we publish and operate it for you.`,
    viewDemo: "View the demo", bookCall: "Book a free 30-minute review", includedTitle: "Included as a DemoSites customer:",
    includedItems: ["Free 30-minute review — we analyse the business and suggest improvements", "60% discount on developer hours: NOK 596/hour (normally NOK 1,490/hour)", "SEO & Google optimisation can be added for NOK 490 (one-time)"],
    questionText: "Questions before ordering? Email us at post@chatgenius.pro.", goToDemoSites: "Learn about DemoSites", notSet: "Not set",
    paid: "Paid", pending: "Awaiting payment", unpaid: "Not paid", claimed: "Reserved by customer", approved: "Approved", live: "Live", temporaryDemo: "Temporary demo",
    checkoutPaid: "Payment received! We are preparing and publishing your site.", checkoutExpired: "This demo has expired. Contact ChatGenius and we can reopen it.", checkoutReserved: "The site is reserved. You can complete payment when you are ready.",
    seoTitle: "SEO & Google optimisation", seoPrice: "+NOK 490 (one-time)", seoDescription: "Keyword optimisation, Google Business Profile and local-search visibility — configured once and kept in place.",
    checkoutLoading: "Opening secure checkout...", checkoutButton: "Order and pay now", checkoutSecurity: "Secure payment via Stripe · Setup + first month · No commitment beyond the month", checkoutError: "Could not start checkout.", checkoutMissingUrl: "The payment provider did not return a checkout link.",
  },
  es: {
    title: (company) => `Convierte la demo en la web oficial de ${company}`,
    intro: "Paga ahora la puesta en marcha y el primer mes y publicaremos la web con hosting, SSL y mantenimiento — la demo que ya has visto pasa a ser tuya.",
    expires: "Caduca", expired: "Esta demo ha caducado.", statusTitle: "Estado de la demo",
    paymentSuccess: "El pago se ha enviado para confirmación. La publicación y configuración comenzarán cuando Stripe lo confirme.",
    paymentCancelled: "El pago se ha cancelado. Puedes iniciar el pago de nuevo cuando quieras.",
    status: "Estado", payment: "Pago", package: "Paquete", industry: "Sector", website: "Web actual",
    nextStep: "Siguiente paso", steps: ["Paga de forma segura con tarjeta mediante Stripe — puesta en marcha + primer mes en un solo pago.", "Cuando Stripe confirme el pago, comenzará la publicación y configuración.", "El servicio mensual se renueva automáticamente. Sin permanencia más allá del mes en curso."],
    keepTitle: "¿Quieres conservar la web?", keepBody: (packageLabel) => `${packageLabel}. Paga ahora y la web será tuya — la publicamos y mantenemos por ti.`,
    viewDemo: "Ver la demo", bookCall: "Reservar análisis gratuito de 30 min", includedTitle: "Incluido como cliente de DemoSites:",
    includedItems: ["Análisis gratuito de 30 min — revisamos el negocio y proponemos mejoras", "60 % de descuento en horas de desarrollo: 596 NOK/h (precio normal 1.490 NOK/h)", "SEO y optimización de Google por 490 NOK (pago único)"],
    questionText: "¿Preguntas antes de contratar? Escríbenos a post@chatgenius.pro.", goToDemoSites: "Más sobre DemoSites", notSet: "No indicado",
    paid: "Pagado", pending: "Pendiente de pago", unpaid: "No pagado", claimed: "Reservada por el cliente", approved: "Aprobada", live: "Publicada", temporaryDemo: "Demo temporal",
    checkoutPaid: "¡Pago recibido! Estamos preparando y publicando tu web.", checkoutExpired: "Esta demo ha caducado. Contacta con ChatGenius y podemos reactivarla.", checkoutReserved: "La web está reservada. Puedes completar el pago cuando quieras.",
    seoTitle: "SEO y optimización de Google", seoPrice: "+490 NOK (pago único)", seoDescription: "Optimización de palabras clave, Perfil de Empresa de Google y visibilidad local — configuración única.",
    checkoutLoading: "Abriendo pago seguro...", checkoutButton: "Contratar y pagar", checkoutSecurity: "Pago seguro con Stripe · Puesta en marcha + primer mes · Sin permanencia más allá del mes", checkoutError: "No se pudo iniciar el pago.", checkoutMissingUrl: "El proveedor de pago no devolvió un enlace de checkout.",
  },
  de: {
    title: (company) => `Machen Sie die Demo zur offiziellen Website von ${company}`,
    intro: "Bezahlen Sie jetzt Einrichtung und ersten Monat. Wir veröffentlichen die Website inklusive Hosting, SSL und Betrieb — die bereits gesehene Demo gehört dann Ihnen.",
    expires: "Läuft ab", expired: "Diese Demo ist abgelaufen.", statusTitle: "Demo-Status",
    paymentSuccess: "Die Zahlung wurde zur Bestätigung gesendet. Veröffentlichung und Einrichtung starten nach Bestätigung durch Stripe.",
    paymentCancelled: "Die Zahlung wurde abgebrochen. Sie können den Checkout jederzeit erneut starten.",
    status: "Status", payment: "Zahlung", package: "Paket", industry: "Branche", website: "Bestehende Website",
    nextStep: "Nächster Schritt", steps: ["Sicher per Karte über Stripe bezahlen — Einrichtung + erster Monat in einem Checkout.", "Nach Stripe-Bestätigung starten Veröffentlichung und Einrichtung.", "Der monatliche Betrieb verlängert sich automatisch. Keine Bindung über den laufenden Monat hinaus."],
    keepTitle: "Möchten Sie die Website behalten?", keepBody: (packageLabel) => `${packageLabel}. Jetzt bezahlen und die Website gehört Ihnen — wir veröffentlichen und betreiben sie.`,
    viewDemo: "Demo ansehen", bookCall: "Kostenlose 30-Minuten-Analyse buchen", includedTitle: "Für DemoSites-Kunden enthalten:",
    includedItems: ["Kostenlose 30-Minuten-Analyse mit Verbesserungsvorschlägen", "60 % Rabatt auf Entwicklerstunden: 596 NOK/Stunde (regulär 1.490 NOK/Stunde)", "SEO & Google-Optimierung für 490 NOK einmalig"],
    questionText: "Fragen vor der Bestellung? Schreiben Sie an post@chatgenius.pro.", goToDemoSites: "Mehr über DemoSites", notSet: "Nicht angegeben",
    paid: "Bezahlt", pending: "Zahlung ausstehend", unpaid: "Nicht bezahlt", claimed: "Vom Kunden reserviert", approved: "Freigegeben", live: "Live", temporaryDemo: "Temporäre Demo",
    checkoutPaid: "Zahlung erhalten! Wir bereiten Ihre Website vor und veröffentlichen sie.", checkoutExpired: "Diese Demo ist abgelaufen. Kontaktieren Sie ChatGenius, damit wir sie wieder öffnen.", checkoutReserved: "Die Website ist reserviert. Sie können die Zahlung abschließen, sobald Sie bereit sind.",
    seoTitle: "SEO & Google-Optimierung", seoPrice: "+490 NOK (einmalig)", seoDescription: "Keyword-Optimierung, Google-Unternehmensprofil und lokale Sichtbarkeit — einmal eingerichtet.",
    checkoutLoading: "Sichere Zahlung wird geöffnet...", checkoutButton: "Jetzt bestellen und bezahlen", checkoutSecurity: "Sichere Zahlung über Stripe · Einrichtung + erster Monat · Keine Bindung über den Monat hinaus", checkoutError: "Checkout konnte nicht gestartet werden.", checkoutMissingUrl: "Der Zahlungsanbieter hat keinen Checkout-Link zurückgegeben.",
  },
  fr: {
    title: (company) => `Faites de la démo le site officiel de ${company}`,
    intro: "Réglez maintenant la mise en place et le premier mois : nous publions le site avec hébergement, SSL et exploitation — la démo que vous avez vue devient la vôtre.",
    expires: "Expire", expired: "Cette démo a expiré.", statusTitle: "Statut de la démo",
    paymentSuccess: "Le paiement a été envoyé pour confirmation. La publication et la configuration commencent après confirmation de Stripe.",
    paymentCancelled: "Le paiement a été annulé. Vous pouvez relancer le paiement quand vous le souhaitez.",
    status: "Statut", payment: "Paiement", package: "Forfait", industry: "Secteur", website: "Site actuel",
    nextStep: "Prochaine étape", steps: ["Payez en toute sécurité par carte via Stripe — mise en place + premier mois en une seule fois.", "Après confirmation Stripe, la publication et la configuration commencent.", "Le service mensuel se renouvelle automatiquement. Aucun engagement au-delà du mois en cours."],
    keepTitle: "Souhaitez-vous conserver le site ?", keepBody: (packageLabel) => `${packageLabel}. Payez maintenant et le site devient le vôtre — nous le publions et l’exploitons pour vous.`,
    viewDemo: "Voir la démo", bookCall: "Réserver une analyse gratuite de 30 min", includedTitle: "Inclus pour les clients DemoSites :",
    includedItems: ["Analyse gratuite de 30 min avec recommandations", "60 % de remise sur les heures de développement : 596 NOK/h (1 490 NOK/h habituellement)", "SEO & optimisation Google pour 490 NOK en paiement unique"],
    questionText: "Une question avant de commander ? Écrivez à post@chatgenius.pro.", goToDemoSites: "En savoir plus sur DemoSites", notSet: "Non indiqué",
    paid: "Payé", pending: "Paiement en attente", unpaid: "Non payé", claimed: "Réservé par le client", approved: "Approuvé", live: "En ligne", temporaryDemo: "Démo temporaire",
    checkoutPaid: "Paiement reçu ! Nous préparons et publions votre site.", checkoutExpired: "Cette démo a expiré. Contactez ChatGenius pour la rouvrir.", checkoutReserved: "Le site est réservé. Vous pouvez terminer le paiement quand vous êtes prêt.",
    seoTitle: "SEO & optimisation Google", seoPrice: "+490 NOK (paiement unique)", seoDescription: "Optimisation des mots-clés, fiche Google Business et visibilité locale — configuration unique.",
    checkoutLoading: "Ouverture du paiement sécurisé...", checkoutButton: "Commander et payer", checkoutSecurity: "Paiement sécurisé via Stripe · Mise en place + premier mois · Sans engagement au-delà du mois", checkoutError: "Impossible de démarrer le paiement.", checkoutMissingUrl: "Le prestataire de paiement n’a pas renvoyé de lien de checkout.",
  },
  ru: {
    title: (company) => `Сделайте демо официальным сайтом ${company}`,
    intro: "Оплатите настройку и первый месяц — мы опубликуем сайт с хостингом, SSL и обслуживанием. Демо, которое вы уже видели, станет вашим.",
    expires: "Истекает", expired: "Срок этой демо-версии истёк.", statusTitle: "Статус демо",
    paymentSuccess: "Платёж отправлен на подтверждение. Публикация и настройка начнутся после подтверждения Stripe.",
    paymentCancelled: "Платёж отменён. Вы можете начать оплату снова, когда будете готовы.",
    status: "Статус", payment: "Оплата", package: "Пакет", industry: "Отрасль", website: "Текущий сайт",
    nextStep: "Следующий шаг", steps: ["Безопасно оплатите картой через Stripe — настройка + первый месяц одним платежом.", "После подтверждения Stripe начнутся публикация и настройка.", "Ежемесячное обслуживание продлевается автоматически. Без обязательств дольше текущего месяца."],
    keepTitle: "Хотите сохранить сайт?", keepBody: (packageLabel) => `${packageLabel}. Оплатите сейчас, и сайт станет вашим — мы опубликуем и будем обслуживать его.`,
    viewDemo: "Открыть демо", bookCall: "Бесплатный 30-минутный разбор", includedTitle: "Включено для клиентов DemoSites:",
    includedItems: ["Бесплатный 30-минутный разбор бизнеса с рекомендациями", "Скидка 60 % на часы разработчика: 596 NOK/ч (обычно 1 490 NOK/ч)", "SEO и оптимизация Google за 490 NOK единовременно"],
    questionText: "Есть вопросы до заказа? Напишите на post@chatgenius.pro.", goToDemoSites: "Подробнее о DemoSites", notSet: "Не указано",
    paid: "Оплачено", pending: "Ожидает оплаты", unpaid: "Не оплачено", claimed: "Зарезервировано клиентом", approved: "Одобрено", live: "Опубликовано", temporaryDemo: "Временное демо",
    checkoutPaid: "Оплата получена! Мы готовим и публикуем ваш сайт.", checkoutExpired: "Срок демо истёк. Свяжитесь с ChatGenius, и мы сможем снова открыть его.", checkoutReserved: "Сайт зарезервирован. Вы можете завершить оплату, когда будете готовы.",
    seoTitle: "SEO и оптимизация Google", seoPrice: "+490 NOK (разово)", seoDescription: "Оптимизация ключевых слов, профиль Google Business и локальная видимость — настраивается один раз.",
    checkoutLoading: "Открываем безопасную оплату...", checkoutButton: "Заказать и оплатить", checkoutSecurity: "Безопасная оплата через Stripe · Настройка + первый месяц · Без обязательств дольше месяца", checkoutError: "Не удалось начать оплату.", checkoutMissingUrl: "Платёжный сервис не вернул ссылку на checkout.",
  },
  sv: {
    title: (company) => `Gör demon till den officiella webbplatsen för ${company}`,
    intro: "Betala startavgiften och första månaden nu, så publicerar vi sidan med hosting, SSL och drift — demon du redan sett blir din.",
    expires: "Går ut", expired: "Den här demon har gått ut.", statusTitle: "Demo-status",
    paymentSuccess: "Betalningen har skickats för bekräftelse. Publicering och setup startar när Stripe bekräftar den.",
    paymentCancelled: "Betalningen avbröts. Du kan starta betalningen igen när du vill.",
    status: "Status", payment: "Betalning", package: "Paket", industry: "Bransch", website: "Befintlig webbplats",
    nextStep: "Nästa steg", steps: ["Betala säkert med kort via Stripe — start + första månaden i samma betalning.", "När Stripe bekräftar betalningen startar publicering och setup.", "Månadsdriften förnyas automatiskt. Ingen bindningstid utöver aktuell månad."],
    keepTitle: "Vill du behålla sidan?", keepBody: (packageLabel) => `${packageLabel}. Betala nu så blir sidan din — vi publicerar och driver den åt dig.`,
    viewDemo: "Visa demon", bookCall: "Boka gratis 30 min analys", includedTitle: "Ingår som DemoSites-kund:",
    includedItems: ["Gratis 30 min analys med förbättringsförslag", "60 % rabatt på utvecklartimmar: 596 NOK/tim (ord. 1 490 NOK/tim)", "SEO & Google-optimering kan läggas till för 490 NOK engångsbelopp"],
    questionText: "Frågor innan beställning? Mejla post@chatgenius.pro.", goToDemoSites: "Läs om DemoSites", notSet: "Inte angivet",
    paid: "Betald", pending: "Väntar på betalning", unpaid: "Inte betald", claimed: "Reserverad av kund", approved: "Godkänd", live: "Live", temporaryDemo: "Tillfällig demo",
    checkoutPaid: "Betalning mottagen! Vi förbereder och publicerar din sida.", checkoutExpired: "Demon har gått ut. Kontakta ChatGenius så kan vi öppna den igen.", checkoutReserved: "Sidan är reserverad. Du kan slutföra betalningen när du är redo.",
    seoTitle: "SEO & Google-optimering", seoPrice: "+490 NOK (engångsbelopp)", seoDescription: "Sökordsoptimering, Google Business-profil och lokal synlighet — sätts upp en gång.",
    checkoutLoading: "Öppnar säker betalning...", checkoutButton: "Beställ och betala", checkoutSecurity: "Säker betalning via Stripe · Start + första månaden · Ingen bindningstid utöver månaden", checkoutError: "Kunde inte starta betalningen.", checkoutMissingUrl: "Betalleverantören returnerade ingen checkout-länk.",
  },
  da: {
    title: (company) => `Gør demoen til den officielle hjemmeside for ${company}`,
    intro: "Betal opstart og første måned nu, så publicerer vi siden med hosting, SSL og drift — demoen du allerede har set bliver din.",
    expires: "Udløber", expired: "Denne demo er udløbet.", statusTitle: "Demo-status",
    paymentSuccess: "Betalingen er sendt til bekræftelse. Publicering og opsætning starter, når Stripe bekræfter den.",
    paymentCancelled: "Betalingen blev afbrudt. Du kan starte betalingen igen, når du er klar.",
    status: "Status", payment: "Betaling", package: "Pakke", industry: "Branche", website: "Eksisterende hjemmeside",
    nextStep: "Næste skridt", steps: ["Betal sikkert med kort via Stripe — opstart + første måned i én betaling.", "Når Stripe bekræfter betalingen, starter publicering og opsætning.", "Månedlig drift fornyes automatisk. Ingen binding ud over den aktuelle måned."],
    keepTitle: "Vil du beholde siden?", keepBody: (packageLabel) => `${packageLabel}. Betal nu, så bliver siden din — vi publicerer og driver den for dig.`,
    viewDemo: "Se demoen", bookCall: "Book gratis 30 min analyse", includedTitle: "Inkluderet som DemoSites-kunde:",
    includedItems: ["Gratis 30 min analyse med forslag til forbedringer", "60 % rabat på udviklertimer: 596 NOK/t (normalpris 1.490 NOK/t)", "SEO & Google-optimering kan tilføjes for 490 NOK engangsbeløb"],
    questionText: "Spørgsmål før bestilling? Skriv til post@chatgenius.pro.", goToDemoSites: "Læs om DemoSites", notSet: "Ikke angivet",
    paid: "Betalt", pending: "Afventer betaling", unpaid: "Ikke betalt", claimed: "Reserveret af kunde", approved: "Godkendt", live: "Live", temporaryDemo: "Midlertidig demo",
    checkoutPaid: "Betaling modtaget! Vi klargør og publicerer din side.", checkoutExpired: "Denne demo er udløbet. Kontakt ChatGenius, så kan vi åbne den igen.", checkoutReserved: "Siden er reserveret. Du kan gennemføre betalingen, når du er klar.",
    seoTitle: "SEO & Google-optimering", seoPrice: "+490 NOK (engangsbeløb)", seoDescription: "Søgeordsoptimering, Google Business-profil og lokal synlighed — sættes op én gang.",
    checkoutLoading: "Åbner sikker betaling...", checkoutButton: "Bestil og betal", checkoutSecurity: "Sikker betaling via Stripe · Opstart + første måned · Ingen binding ud over måneden", checkoutError: "Kunne ikke starte betalingen.", checkoutMissingUrl: "Betalingsudbyderen returnerede ikke et checkout-link.",
  },
};

export function getDemoSiteClaimCopy(value: unknown) {
  return CLAIM[normalizeDemoSiteLanguage(value)];
}

export function formatDemoSiteDate(value: string | null | undefined, language: unknown) {
  if (!value) return getDemoSiteClaimCopy(language).notSet;
  return new Intl.DateTimeFormat(getDemoSiteLanguageConfig(language).locale, { dateStyle: "medium" }).format(new Date(value));
}

export function buildDemoSiteFollowupEmail(
  languageValue: unknown,
  kind: DemoSiteFollowupKind,
  input: { greetingName?: string; company: string; previewUrl: string; claimUrl: string; expiresAt?: string | null },
) {
  const language = normalizeDemoSiteLanguage(languageValue);
  const helloName = input.greetingName ? ` ${input.greetingName}` : "";
  const expiry = input.expiresAt ? formatDemoSiteDate(input.expiresAt, language) : "";
  const lines = {
    nb: {
      hello: `Hei${helloName},`,
      readySubject: `Nettsidedemoen for ${input.company} er klar`,
      ready: [`Nettsidedemoen for ${input.company} er klar til gjennomgang:`, input.previewUrl, "", "Åpne den gjerne både på mobil og desktop.", "", "Vil du beholde siden og gå videre mot publisering?", input.claimUrl, expiry ? `Demoen er tilgjengelig til ${expiry}.` : ""],
      midwaySubject: `Skal vi publisere den nye nettsiden for ${input.company}?`,
      midway: ["Har du fått sett på nettsidedemoen?", input.previewUrl, "", "Hvis retningen er riktig, kan du gå videre her:", input.claimUrl, "", "Svar gjerne på denne e-posten hvis du ønsker en endring før du bestemmer deg."],
      finalSubject: `Nettsidedemoen for ${input.company} utløper snart`,
      final: ["Demoen utløper snart.", input.previewUrl, "", "Hvis du vil beholde siden og gå videre mot publisering:", input.claimUrl, "", "Svar gjerne på e-posten hvis det er én ting du vil endre før du bestemmer deg."],
      signoff: "Vennlig hilsen\nChatGenius DemoSites",
    },
    en: {
      hello: `Hi${helloName},`,
      readySubject: `Your ${input.company} website demo is ready`,
      ready: [`Your website demo for ${input.company} is ready to review:`, input.previewUrl, "", "Open it on both your phone and desktop.", "", "If you want to keep the site and move towards launch, continue here:", input.claimUrl, expiry ? `The demo remains available until ${expiry}.` : ""],
      midwaySubject: `Would you like us to launch the new ${input.company} website?`,
      midway: ["Have you had a chance to review the website demo?", input.previewUrl, "", "If you like the direction, you can continue here:", input.claimUrl, "", "Reply to this email if you would like anything changed before deciding."],
      finalSubject: `Your ${input.company} website demo expires soon`,
      final: ["Your website demo is about to expire.", input.previewUrl, "", "If you want to keep it and move towards launch:", input.claimUrl, "", "Reply if there is one thing you would like changed before deciding."],
      signoff: "Best regards\nChatGenius DemoSites",
    },
    es: {
      hello: `Hola${helloName},`,
      readySubject: `La demo web de ${input.company} está lista`,
      ready: [`La demo web de ${input.company} ya está lista:`, input.previewUrl, "", "Ábrela tanto en el móvil como en el ordenador.", "", "Si quieres conservarla y avanzar hacia la publicación:", input.claimUrl, expiry ? `La demo estará disponible hasta el ${expiry}.` : ""],
      midwaySubject: `¿Publicamos la nueva web de ${input.company}?`,
      midway: ["¿Has podido revisar la demo?", input.previewUrl, "", "Si te gusta la dirección, puedes continuar aquí:", input.claimUrl, "", "Responde a este email si quieres cambiar algo antes de decidir."],
      finalSubject: `La demo web de ${input.company} caduca pronto`,
      final: ["La demo está a punto de caducar.", input.previewUrl, "", "Si quieres conservarla y avanzar hacia la publicación:", input.claimUrl, "", "Responde si quieres que cambiemos algo antes de decidir."],
      signoff: "Un saludo\nChatGenius DemoSites",
    },
    de: {
      hello: `Hallo${helloName},`,
      readySubject: `Die Website-Demo für ${input.company} ist fertig`,
      ready: [`Die Website-Demo für ${input.company} ist jetzt bereit:`, input.previewUrl, "", "Öffnen Sie sie gern auf Smartphone und Desktop.", "", "Wenn Sie die Website behalten und veröffentlichen möchten:", input.claimUrl, expiry ? `Die Demo ist bis ${expiry} verfügbar.` : ""],
      midwaySubject: `Sollen wir die neue Website von ${input.company} veröffentlichen?`,
      midway: ["Konnten Sie die Demo bereits ansehen?", input.previewUrl, "", "Wenn Ihnen die Richtung gefällt, geht es hier weiter:", input.claimUrl, "", "Antworten Sie auf diese E-Mail, wenn Sie vor der Entscheidung etwas ändern möchten."],
      finalSubject: `Die Website-Demo von ${input.company} läuft bald ab`,
      final: ["Die Demo läuft bald ab.", input.previewUrl, "", "Wenn Sie die Website behalten und veröffentlichen möchten:", input.claimUrl, "", "Antworten Sie gern, wenn Sie vorher noch etwas ändern möchten."],
      signoff: "Viele Grüße\nChatGenius DemoSites",
    },
    fr: {
      hello: `Bonjour${helloName},`,
      readySubject: `La démo du site de ${input.company} est prête`,
      ready: [`La démo du site de ${input.company} est prête :`, input.previewUrl, "", "Ouvrez-la sur mobile et sur ordinateur.", "", "Si vous souhaitez conserver le site et passer à la publication :", input.claimUrl, expiry ? `La démo reste disponible jusqu’au ${expiry}.` : ""],
      midwaySubject: `Souhaitez-vous publier le nouveau site de ${input.company} ?`,
      midway: ["Avez-vous eu le temps de consulter la démo ?", input.previewUrl, "", "Si la direction vous convient, continuez ici :", input.claimUrl, "", "Répondez à cet e-mail si vous souhaitez une modification avant de décider."],
      finalSubject: `La démo du site de ${input.company} expire bientôt`,
      final: ["La démo va bientôt expirer.", input.previewUrl, "", "Si vous souhaitez la conserver et passer à la publication :", input.claimUrl, "", "Répondez si vous souhaitez encore une modification."],
      signoff: "Cordialement\nChatGenius DemoSites",
    },
    ru: {
      hello: `Здравствуйте${helloName},`,
      readySubject: `Демо сайта для ${input.company} готово`,
      ready: [`Демо сайта для ${input.company} готово к просмотру:`, input.previewUrl, "", "Откройте его на телефоне и компьютере.", "", "Если хотите сохранить сайт и перейти к публикации:", input.claimUrl, expiry ? `Демо доступно до ${expiry}.` : ""],
      midwaySubject: `Опубликовать новый сайт ${input.company}?`,
      midway: ["Вы уже успели посмотреть демо?", input.previewUrl, "", "Если вам нравится направление, продолжить можно здесь:", input.claimUrl, "", "Ответьте на это письмо, если хотите что-то изменить до решения."],
      finalSubject: `Демо сайта ${input.company} скоро истекает`,
      final: ["Срок демо скоро истекает.", input.previewUrl, "", "Если хотите сохранить сайт и перейти к публикации:", input.claimUrl, "", "Ответьте, если хотите что-то изменить до решения."],
      signoff: "С уважением\nChatGenius DemoSites",
    },
    sv: {
      hello: `Hej${helloName},`,
      readySubject: `Webbdemon för ${input.company} är klar`,
      ready: [`Webbdemon för ${input.company} är klar:`, input.previewUrl, "", "Öppna den gärna på både mobil och dator.", "", "Om du vill behålla sidan och gå vidare mot publicering:", input.claimUrl, expiry ? `Demon är tillgänglig till ${expiry}.` : ""],
      midwaySubject: `Ska vi publicera den nya webbplatsen för ${input.company}?`,
      midway: ["Har du hunnit titta på demon?", input.previewUrl, "", "Om du gillar riktningen kan du fortsätta här:", input.claimUrl, "", "Svara på mejlet om du vill ändra något innan du bestämmer dig."],
      finalSubject: `Webbdemon för ${input.company} går snart ut`,
      final: ["Demon går snart ut.", input.previewUrl, "", "Om du vill behålla sidan och gå vidare:", input.claimUrl, "", "Svara gärna om du vill ändra något innan du bestämmer dig."],
      signoff: "Vänliga hälsningar\nChatGenius DemoSites",
    },
    da: {
      hello: `Hej${helloName},`,
      readySubject: `Webdemoen for ${input.company} er klar`,
      ready: [`Webdemoen for ${input.company} er klar:`, input.previewUrl, "", "Åbn den gerne på både mobil og computer.", "", "Hvis du vil beholde siden og gå videre mod publicering:", input.claimUrl, expiry ? `Demoen er tilgængelig til ${expiry}.` : ""],
      midwaySubject: `Skal vi publicere den nye hjemmeside for ${input.company}?`,
      midway: ["Har du haft mulighed for at se demoen?", input.previewUrl, "", "Hvis du kan lide retningen, kan du fortsætte her:", input.claimUrl, "", "Svar på mailen hvis du vil ændre noget, før du beslutter dig."],
      finalSubject: `Webdemoen for ${input.company} udløber snart`,
      final: ["Demoen udløber snart.", input.previewUrl, "", "Hvis du vil beholde siden og gå videre:", input.claimUrl, "", "Svar gerne hvis du vil ændre noget, før du beslutter dig."],
      signoff: "Venlig hilsen\nChatGenius DemoSites",
    },
  } as const;
  const t = lines[language];
  const subject = kind === "final" ? t.finalSubject : kind === "midway" ? t.midwaySubject : t.readySubject;
  const body = kind === "final" ? t.final : kind === "midway" ? t.midway : t.ready;
  return { subject, bodyText: [t.hello, "", ...body.filter(Boolean), "", t.signoff].join("\n") };
}
