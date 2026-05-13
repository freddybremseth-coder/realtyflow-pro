type RealtyRecord = Record<string, unknown>;

type MatchResult = {
  brand_id: string;
  visible: boolean;
  reason: string;
  score: number;
};

const BRAND_ALIASES: Record<string, string> = {
  pinoso: "pinosoecolife",
  "pinoso-eco-life": "pinosoecolife",
  pinosoecolife: "pinosoecolife",
  zeneco: "zeneco",
  zenecohomes: "zeneco",
  "zeneco-homes": "zeneco",
};

const PINOSO_LOCATION_TERMS = [
  "costa blanca south inland",
  "costa blanca north inland",
  "costa blanca inland",
  "alicante inland",
  "pinoso",
  "pinos",
  "el pinos",
  "aspe",
  "monforte",
  "monforte del cid",
  "novelda",
  "la romana",
  "hondon",
  "hondon de las nieves",
  "hondon de los frailes",
  "monovar",
  "sax",
  "elda",
  "petrer",
  "villena",
  "font del llop",
  "barbarroja",
  "barba roja",
];

const PINOSO_PROPERTY_TERMS = [
  "villa",
  "chalet",
  "country",
  "finca",
  "cave house",
  "new build",
  "land",
  "plot",
  "terreno",
  "parcela",
  "byggetomt",
];

const COASTAL_EXCLUSION_TERMS = [
  "torrevieja",
  "orihuela costa",
  "campoamor",
  "la zenia",
  "guardamar",
  "santa pola",
  "benidorm",
  "calpe",
  "altea",
  "javea",
  "xabia",
  "denia",
  "moraira",
  "villajoyosa",
  "playa",
  "beachfront",
  "sea front",
  "seafront",
];

function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectSearchText(record: RealtyRecord): string {
  const fields = [
    "brand_id",
    "brand",
    "location",
    "municipality",
    "title",
    "title_no",
    "description",
    "description_no",
    "type",
    "property_type",
    "status",
    "source",
    "notes",
    "features",
  ];

  return fields
    .map((field) => {
      const value = record[field];
      return Array.isArray(value) ? value.join(" ") : value;
    })
    .map(fold)
    .filter(Boolean)
    .join(" ");
}

function includesAny(text: string, terms: string[]): string | null {
  return terms.find((term) => text.includes(fold(term))) ?? null;
}

export function normalizeBrandId(raw?: string | null): string {
  const normalized = fold(raw || "").replace(/\s+/g, "");
  if (!normalized) return "";
  return BRAND_ALIASES[normalized] || normalized;
}

export function classifyPropertyForBrand(property: RealtyRecord, rawBrandId: string): MatchResult {
  const brand_id = normalizeBrandId(rawBrandId);
  const explicitBrand = property.brand_id || property.brand
    ? normalizeBrandId(String(property.brand_id || property.brand || ""))
    : "";
  const text = collectSearchText(property);

  if (explicitBrand && explicitBrand === brand_id) {
    return { brand_id, visible: true, reason: "explicit brand match", score: 100 };
  }

  if (brand_id === "pinosoecolife") {
    const locationMatch = includesAny(text, PINOSO_LOCATION_TERMS);
    const propertyMatch = includesAny(text, PINOSO_PROPERTY_TERMS);
    const coastalMatch = includesAny(text, COASTAL_EXCLUSION_TERMS);
    const inlandMatch = text.includes("inland") || text.includes("interior");

    if (locationMatch && (!coastalMatch || inlandMatch)) {
      return {
        brand_id,
        visible: true,
        reason: propertyMatch
          ? `matches ${locationMatch} and ${propertyMatch}`
          : `matches ${locationMatch}`,
        score: propertyMatch ? 90 : 75,
      };
    }

    return {
      brand_id,
      visible: false,
      reason: coastalMatch ? `excluded coastal match: ${coastalMatch}` : "outside Pinoso inland rules",
      score: coastalMatch ? -20 : 0,
    };
  }

  if (brand_id === "zeneco") {
    const costaMatch = includesAny(text, ["costa blanca", "costa calida", "alicante", "murcia"]);
    return {
      brand_id,
      visible: true,
      reason: costaMatch ? `broad Zeneco area match: ${costaMatch}` : "default Zeneco inventory",
      score: costaMatch ? 60 : 40,
    };
  }

  return {
    brand_id,
    visible: !explicitBrand || explicitBrand === brand_id,
    reason: explicitBrand ? "different explicit brand" : "no brand-specific rule",
    score: explicitBrand ? 0 : 10,
  };
}

export function propertyMatchesBrand(property: RealtyRecord, rawBrandId: string): boolean {
  return classifyPropertyForBrand(property, rawBrandId).visible;
}

export function classifyPropertyForBrands(property: RealtyRecord): MatchResult[] {
  return ["zeneco", "pinosoecolife"].map((brandId) => classifyPropertyForBrand(property, brandId));
}

export function plotMatchesBrand(plot: RealtyRecord, rawBrandId: string): boolean {
  const brandId = normalizeBrandId(rawBrandId);
  if (brandId !== "pinosoecolife") return true;

  const text = collectSearchText(plot);
  const locationMatch = includesAny(text, PINOSO_LOCATION_TERMS);
  const coastalMatch = includesAny(text, COASTAL_EXCLUSION_TERMS);
  return Boolean(locationMatch && !coastalMatch);
}
