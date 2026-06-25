import type { PropertyMatchPreviewResult } from "./property-match-preview";
import type { LeadMatchProfile } from "./property-matching";

const DEFAULT_LOCATION_RADIUS_KM = 30;
const EARTH_RADIUS_KM = 6371;

const REGION_CATALOG = [
  {
    id: "costa-blanca-north",
    names: ["costa blanca nord", "costa blanca north", "costa blanca ", "costa blanca"],
    areas: [
      "albir",
      "altea",
      "benidorm",
      "benissa",
      "calpe",
      "denia",
      "dénia",
      "el campello",
      "finestrat",
      "javea",
      "jávea",
      "xabia",
      "xàbia",
      "l'alfas del pi",
      "l'alfàs del pi",
      "alfaz del pi",
      "alfas del pi",
      "la nucia",
      "moraira",
      "polop",
      "polop de la marina",
      "villajoyosa",
      "xalo",
      "jalon",
    ],
  },
  {
    id: "costa-blanca-south",
    names: ["costa blanca sør", "costa blanca south"],
    areas: [
      "campoamor",
      "ciudad quesada",
      "quesada",
      "el raso",
      "gran alacant",
      "guardamar",
      "guardamar del segura",
      "la mata",
      "la zenia",
      "orihuela costa",
      "san fulgencio",
      "san miguel",
      "san miguel de salinas",
      "santa pola",
      "torrevieja",
    ],
  },
  {
    id: "costa-blanca-inland",
    names: ["costa blanca innland", "costa blanca inland", "costa blanca south - inland"],
    areas: [
      "aspe",
      "biar",
      "elda",
      "font del llop",
      "hondon de la nieves",
      "hondón de las nieves",
      "hondon de las nieves",
      "hondon de los frailes",
      "hondón de los frailes",
      "jumilla",
      "la romana",
      "monforte del cid",
      "montforte del cid",
      "petrer",
      "pinoso",
      "relleu",
      "sax",
      "villena",
      "yecla",
    ],
  },
  {
    id: "costa-calida",
    names: ["costa calida", "costa cálida", "murcia"],
    areas: [
      "altaona golf",
      "calasparra",
      "la manga",
      "los alcazares",
      "los alcázares",
      "los narejos",
      "murcia",
      "playa honda",
      "roda",
      "san javier",
      "san pedro del pinatar",
      "santiago de la ribera",
      "santiage de la ribera",
      "torre pacheco",
    ],
  },
] as const;

const COSTA_BLANCA_LOCATION_CENTROIDS = [
  { name: "Moraira", aliases: ["moraira", "moreira"], lat: 38.6886, lng: 0.1348 },
  { name: "Teulada", aliases: ["teulada"], lat: 38.7295, lng: 0.1036 },
  { name: "Benitachell", aliases: ["benitachell", "poble nou de benitatxell", "benitatxell"], lat: 38.7326, lng: 0.1433 },
  { name: "Benissa", aliases: ["benissa"], lat: 38.714, lng: 0.0519 },
  { name: "Calpe", aliases: ["calpe", "calp"], lat: 38.6447, lng: 0.0445 },
  { name: "Javea", aliases: ["javea", "jávea", "xabia", "xàbia"], lat: 38.7899, lng: 0.166 },
  { name: "Denia", aliases: ["denia", "dénia"], lat: 38.8408, lng: 0.1057 },
  { name: "Altea", aliases: ["altea"], lat: 38.5989, lng: -0.0514 },
  { name: "Albir", aliases: ["albir", "l'albir", "el albir"], lat: 38.5717, lng: -0.0677 },
  { name: "Benidorm", aliases: ["benidorm"], lat: 38.5411, lng: -0.1225 },
  { name: "Finestrat", aliases: ["finestrat", "cala de finestrat", "cala finestrat"], lat: 38.567, lng: -0.212 },
  { name: "Polop", aliases: ["polop", "polop de la marina"], lat: 38.6226, lng: -0.1309 },
  { name: "La Nucia", aliases: ["la nucia", "nucia"], lat: 38.6138, lng: -0.1269 },
  { name: "Alfaz del Pi", aliases: ["alfaz del pi", "l'alfas del pi", "l'alfàs del pi", "alfas del pi"], lat: 38.5806, lng: -0.1032 },
  { name: "Elche", aliases: ["elche", "elx"], lat: 38.2699, lng: -0.7126 },
  { name: "Hondón de las Nieves", aliases: ["hondon de las nieves", "hondón de las nieves", "hondon de la nieves"], lat: 38.3085, lng: -0.8531 },
  { name: "Guardamar del Segura", aliases: ["guardamar", "guardamar del segura"], lat: 38.0895, lng: -0.6556 },
  { name: "Torrevieja", aliases: ["torrevieja"], lat: 37.9847, lng: -0.6808 },
  { name: "Ciudad Quesada", aliases: ["ciudad quesada", "quesada"], lat: 38.0686, lng: -0.7256 },
  { name: "Los Alcázares", aliases: ["los alcazares", "los alcázares"], lat: 37.7443, lng: -0.8504 },
  { name: "San Miguel de Salinas", aliases: ["san miguel de salinas"], lat: 37.9797, lng: -0.789 },
] as const;

type LocationCentroid = (typeof COSTA_BLANCA_LOCATION_CENTROIDS)[number];
type RegionId = (typeof REGION_CATALOG)[number]["id"];

function fold(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanLocationValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

function regionTextMatches(text: string, value: string) {
  const foldedText = fold(text);
  const foldedValue = fold(value);
  return foldedText === foldedValue || foldedText.includes(foldedValue);
}

function regionsFromText(text: string | null): Set<RegionId> {
  const regions = new Set<RegionId>();
  if (!text) return regions;

  for (const region of REGION_CATALOG) {
    if (region.names.some((name) => regionTextMatches(text, name))) {
      regions.add(region.id);
      continue;
    }
    if (region.areas.some((area) => regionTextMatches(text, area))) {
      regions.add(region.id);
    }
  }

  return regions;
}

function allowedRegionsFromProfile(profile: LeadMatchProfile) {
  const preferred = cleanLocationValues(profile.locations.preferred);
  const regions = new Set<RegionId>();
  for (const location of preferred) {
    for (const region of regionsFromText(location)) regions.add(region);
  }
  return regions;
}

function matchTextForProperty(match: PropertyMatchPreviewResult["matches"][number]) {
  return [match.property.location, match.property.title, match.property.reference]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function hasAllowedRegion(
  profile: LeadMatchProfile,
  match: PropertyMatchPreviewResult["matches"][number],
) {
  const allowedRegions = allowedRegionsFromProfile(profile);
  if (allowedRegions.size === 0) return true;

  const propertyRegions = regionsFromText(matchTextForProperty(match));
  if (propertyRegions.size === 0) return true;

  return Array.from(propertyRegions).some((region) => allowedRegions.has(region));
}

function locationTextMatches(actual: string, expected: string) {
  const actualFolded = fold(actual);
  const expectedFolded = fold(expected);
  return actualFolded === expectedFolded || actualFolded.includes(expectedFolded) || expectedFolded.includes(actualFolded);
}

function knownLocationFromText(value: string): LocationCentroid | null {
  const folded = fold(value);
  const matches = COSTA_BLANCA_LOCATION_CENTROIDS.filter((location) =>
    location.aliases.some((alias) => {
      const aliasFolded = fold(alias);
      return folded === aliasFolded || folded.includes(aliasFolded);
    }),
  );
  return matches.sort((left, right) => right.name.length - left.name.length)[0] || null;
}

function distanceKm(left: { lat: number; lng: number }, right: { lat: number; lng: number }) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function nearestPreferredLocationDistance(actual: string, preferred: string[]) {
  const actualLocation = knownLocationFromText(actual);
  if (!actualLocation) return null;

  const distances = preferred
    .map((location) => knownLocationFromText(location))
    .filter((location): location is LocationCentroid => Boolean(location))
    .map((preferredLocation) => ({
      preferredLocation,
      actualLocation,
      distanceKm: distanceKm(preferredLocation, actualLocation),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm);

  return distances[0] || null;
}

function isAllowedAutoLocationMatch(
  profile: LeadMatchProfile,
  match: PropertyMatchPreviewResult["matches"][number],
) {
  if (!hasAllowedRegion(profile, match)) return false;

  const preferred = cleanLocationValues(profile.locations.preferred);
  const propertyText = matchTextForProperty(match);
  if (preferred.length === 0 || !propertyText) return true;
  if (preferred.some((preferredLocation) => locationTextMatches(propertyText, preferredLocation))) return true;

  const nearest = nearestPreferredLocationDistance(propertyText, preferred);
  if (nearest) return nearest.distanceKm <= DEFAULT_LOCATION_RADIUS_KM;

  return profile.locations.flexible === true;
}

export function applyLeadPropertyLocationGuard(
  result: PropertyMatchPreviewResult,
  profile: LeadMatchProfile,
): PropertyMatchPreviewResult {
  if (result.discoveryMode !== "auto") return result;

  const matches = result.matches.filter((match) =>
    isAllowedAutoLocationMatch(profile, match),
  );

  if (matches.length === result.matches.length) return result;

  return {
    ...result,
    matched: matches.filter((match) => match.eligibility !== "rejected").length,
    matches,
  };
}
