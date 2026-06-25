import type { PropertyMatchPreviewResult } from "./property-match-preview";
import type { LeadMatchProfile } from "./property-matching";

const DEFAULT_LOCATION_RADIUS_KM = 30;
const EARTH_RADIUS_KM = 6371;

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
  { name: "La Nucia", aliases: ["la nucia", "la nucia", "nucia"], lat: 38.6138, lng: -0.1269 },
  { name: "Alfaz del Pi", aliases: ["alfaz del pi", "l'alfas del pi", "l'alfàs del pi", "alfas del pi"], lat: 38.5806, lng: -0.1032 },
  { name: "Elche", aliases: ["elche", "elx"], lat: 38.2699, lng: -0.7126 },
  { name: "Guardamar del Segura", aliases: ["guardamar", "guardamar del segura"], lat: 38.0895, lng: -0.6556 },
  { name: "Torrevieja", aliases: ["torrevieja"], lat: 37.9847, lng: -0.6808 },
  { name: "Ciudad Quesada", aliases: ["ciudad quesada", "quesada"], lat: 38.0686, lng: -0.7256 },
  { name: "San Miguel de Salinas", aliases: ["san miguel de salinas"], lat: 37.9797, lng: -0.789 },
] as const;

type LocationCentroid = (typeof COSTA_BLANCA_LOCATION_CENTROIDS)[number];

function fold(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanLocationValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
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

function isAllowedAutoLocationMatch(profile: LeadMatchProfile, location: string | null) {
  const preferred = cleanLocationValues(profile.locations.preferred);
  if (preferred.length === 0 || !location) return true;
  if (preferred.some((preferredLocation) => locationTextMatches(location, preferredLocation))) return true;

  const nearest = nearestPreferredLocationDistance(location, preferred);
  if (nearest) return nearest.distanceKm <= DEFAULT_LOCATION_RADIUS_KM;

  return profile.locations.flexible === true;
}

export function applyLeadPropertyLocationGuard(
  result: PropertyMatchPreviewResult,
  profile: LeadMatchProfile,
): PropertyMatchPreviewResult {
  if (result.discoveryMode !== "auto") return result;

  const matches = result.matches.filter((match) =>
    isAllowedAutoLocationMatch(profile, match.property.location),
  );

  if (matches.length === result.matches.length) return result;

  return {
    ...result,
    matched: matches.filter((match) => match.eligibility !== "rejected").length,
    matches,
  };
}
