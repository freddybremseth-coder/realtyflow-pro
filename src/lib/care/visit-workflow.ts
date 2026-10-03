export const CARE_CATEGORY_LABELS: Record<string, string> = {
  arrival_exterior: "Ankomst & utvendig",
  security_access: "Sikkerhet & tilgang",
  mail_documents: "Post & dokumenter",
  water_drainage: "Vann & avløp",
  climate_indoor: "Klima & inne",
  power_meters: "Strøm & målere",
  rooms_checkout: "Rom & avslutning",
};

export const CARE_ITEM_LABELS: Record<string, string> = {
  "arrival.checkin": "Ankomst registrert",
  "exterior.facade": "Fasade og synlige skader",
  "exterior.roof_gutters": "Tak og takrenner",
  "exterior.terrace": "Terrasse og uteareal",
  "exterior.furniture": "Utemøbler",
  "exterior.awnings": "Markiser og solskjerming",
  "exterior.garden": "Hage og beplantning",
  "security.entrance_door": "Inngangsdør og låser",
  "security.rejas": "Gitter og sikring",
  "security.windows": "Vinduer og balkongdører",
  "security.alarm": "Alarm",
  "security.sensors": "Sensorer",
  "security.advertising": "Uønsket reklame / tegn på fravær",
  "security.intrusion": "Tegn på innbrudd eller uvedkommende",
  "mail.collected": "Post samlet inn",
  "mail.official": "Offentlig/viktig post",
  "mail.scanned": "Post som skal dokumenteres",
  "water.trap_kitchen": "Vannlås kjøkken",
  "water.trap_bath1": "Vannlås bad 1",
  "water.trap_bath2": "Vannlås bad 2",
  "water.floor_drains": "Sluk",
  "water.toilets": "Toaletter",
  "water.leaks": "Lekkasjer / fukt",
  "water.boiler": "Varmtvannsbereder",
  "water.stopcock": "Hovedkran / stoppekran",
  "climate.ventilation": "Lufting og ventilasjon",
  "climate.temperature": "Temperatur",
  "climate.humidity": "Luftfuktighet",
  "climate.mould": "Mugg / fuktmerker",
  "climate.ac_cooling": "Aircondition kjøling",
  "climate.ac_heating": "Aircondition varme",
  "climate.ac_filter": "AC-filter / vedlikeholdsbehov",
  "power.breakers": "Sikringsskap",
  "power.electricity_meter": "Strømmåler",
  "power.water_meter": "Vannmåler",
  "power.fridge": "Kjøleskap / fryser",
  "power.timers": "Timere og automatisering",
  "rooms.walkthrough": "Gjennomgang av alle rom",
  "rooms.pests": "Skadedyr / insekter",
  "rooms.appliances": "Synlige feil på hvitevarer",
  "pool.technical": "Basseng og teknisk anlegg",
  "checkout.secure": "Boligen låst og sikret ved avreise",
};

export type CareChecklistStatus = "ok" | "deviation" | "not_applicable" | "not_checked";

export function careItemLabel(code: string) {
  return CARE_ITEM_LABELS[code] || code.replace(/[._]/g, " ");
}

export function careCategoryLabel(category: string) {
  return CARE_CATEGORY_LABELS[category] || category.replace(/_/g, " ");
}

export function nextCareVisitAt(from: Date, visitsPerMonth: number) {
  const count = Number.isFinite(visitsPerMonth) && visitsPerMonth > 0 ? visitsPerMonth : 1;
  const next = new Date(from);
  if (count <= 1) {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + Math.max(7, Math.round(30 / count)));
  }
  next.setHours(10, 0, 0, 0);
  return next;
}

export function careReportReference(completedAt = new Date()) {
  const day = completedAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `CARE-${day}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function careWorkOrderReference(createdAt = new Date()) {
  const day = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `CARE-WO-${day}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
