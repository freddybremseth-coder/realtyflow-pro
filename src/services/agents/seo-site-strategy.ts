/**
 * Grounded per-host editorial direction for Sam's autonomous read-only review.
 * These are research priorities, not a claim about live traffic or permission to
 * publish. Actual public copy and factual commercial claims must be verified
 * against the owner-controlled site/source before any change.
 */
export const SAM_SITE_STRATEGY = [
  {
    brandId: "zeneco", host: "www.zenecohomes.com",
    intent: "Modern coastal Spanish homes, area guides and qualified property inquiries",
    qualityGate: "Use current property inventory for prices, availability, plots, areas, handover and buyer costs; never invent guarantees.",
  },
  {
    brandId: "pinosoecolife", host: "www.pinosoecolife.com",
    intent: "Inland Spanish lifestyle, plots, rural homes and new-build inquiry journeys",
    qualityGate: "Never assume a plot is included in a build price. Verify actual plot, utilities, pool, legal and build scope per listing.",
  },
  {
    brandId: "freddyb", host: "www.freddybremseth.com",
    intent: "Verifiable personal expertise, biography, service discovery and links to owned projects",
    qualityGate: "Differentiate professional services from author's books, art and music. Do not invent qualifications, credentials or outcomes.",
  },
  {
    brandId: "freddypublishing", host: "books.freddybremseth.com",
    intent: "Discover books, genres, series, individual titles, language editions and sample reading",
    qualityGate: "Use only published and verified book metadata, available formats, actual cover art, prices and publication status.",
  },
  {
    brandId: "freddyart", host: "art.freddybremseth.com",
    intent: "Discover the artist, English artwork titles, individual works, collections and available editions",
    qualityGate: "Artwork text must reflect the real work. Do not claim prints, limited editions, provenance or prices unless verified for that work.",
  },
  {
    brandId: "remasterfreddy", host: "remaster.freddybremseth.com",
    intent: "Discover genuine music releases, artist information, videos and listening destinations",
    qualityGate: "Keep website search data separate from YouTube reach and verify releases, artist identity and media rights.",
  },
  {
    brandId: "donaanna", host: "www.donaanna.com",
    intent: "Discover olive growing, brand story, harvest information and genuinely available products",
    qualityGate: "Verify product origin, certifications, availability, prices and health claims; never infer organic certification from marketing language.",
  },
  {
    brandId: "chatgenius", host: "www.chatgenius.pro",
    intent: "Explain supported software capabilities, customer questions, demos and qualified product inquiries",
    qualityGate: "Verify features, service availability, integrations, prices and security statements against the deployed product.",
  },
] as const;
