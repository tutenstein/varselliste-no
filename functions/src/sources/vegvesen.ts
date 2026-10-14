import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { Category, eventId, ParsedEvent } from "../lib/model";
import { findFylke, findKommune, findKommuneInText } from "../lib/regions";

/**
 * Statens vegvesen traffic messages (DATEX II 3.1) via the keyless OGC WFS mirror:
 * https://www.vegvesen.no/om-oss/om-organisasjonen/apne-data/et-utvalg-apne-data/ogc-karttjenester/kartlag/
 * Licence NLOD; credit Statens vegvesen. The DATEX terms say Norwegian message texts
 * must not be translated — the English UI builds its own labels from the codes and
 * shows the free text unchanged.
 * Each run asks only for records updated since the previous run (CQL_FILTER on
 * LAST_UPDATE_TIME); a periodic id-only snapshot tells which situations have ended.
 */
export const VEGVESEN_WFS = "https://ogckart-sn1.atlas.vegvesen.no/datex_3_1/wfs";
export const VEGVESEN_LAYER = "datex_3_1:SituationSimple_v2";
export const VEGVESEN_ATTRIBUTION = "Kilde: Statens vegvesen, NLOD";
export const VEGVESEN_PAGE = "https://www.vegvesen.no/trafikk/";

export const VEGVESEN_FIELDS = [
  "ID",
  "SITUATION_ID",
  "RECORD_ID",
  "IS_MAIN_RECORD",
  "VERSION",
  "SITUATION_TYPE",
  "SECONDARY_TYPES",
  "SEVERITY",
  "PROBABILITY",
  "DESCRIPTION",
  "LOCATION_DESCRIPTION",
  "ROAD_NUMBER",
  "COORDINATES_FOR_DISPLAY_LATITUDE",
  "COORDINATES_FOR_DISPLAY_LONGITUDE",
  "START_TIME",
  "END_TIME",
  "CREATION_DATE",
  "LAST_UPDATE_TIME",
] as const;

export interface VegvesenRecord {
  ID?: number;
  SITUATION_ID: string;
  RECORD_ID: string;
  IS_MAIN_RECORD?: number | boolean | null;
  VERSION?: string | number | null;
  SITUATION_TYPE?: string | null;
  SECONDARY_TYPES?: string | null;
  SEVERITY?: string | null;
  PROBABILITY?: string | null;
  DESCRIPTION?: string | null;
  LOCATION_DESCRIPTION?: string | null;
  ROAD_NUMBER?: string | null;
  COORDINATES_FOR_DISPLAY_LATITUDE?: number | null;
  COORDINATES_FOR_DISPLAY_LONGITUDE?: number | null;
  START_TIME?: string | null;
  END_TIME?: string | null;
  CREATION_DATE?: string | null;
  LAST_UPDATE_TIME?: string | null;
}

interface FeatureCollection<P> {
  features?: { properties?: P }[];
  numberMatched?: number;
}

function wfsUrl(fields: readonly string[], cql?: string): string {
  const p = new URLSearchParams({
    service: "wfs",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: VEGVESEN_LAYER,
    outputFormat: "application/json",
    propertyName: fields.join(","),
  });
  if (cql) p.set("CQL_FILTER", cql);
  return `${VEGVESEN_WFS}?${p}`;
}

/**
 * Records updated after `since` (all records when omitted). A record can appear on
 * several rows (one per location or period, same RECORD_ID); one row per record is kept.
 */
export async function fetchRecords(since?: Date): Promise<VegvesenRecord[]> {
  const cql = since ? `LAST_UPDATE_TIME>'${since.toISOString().replace(/\.\d{3}Z$/u, "Z")}'` : undefined;
  const data = await fetchJson<FeatureCollection<VegvesenRecord>>(wfsUrl(VEGVESEN_FIELDS, cql), { timeoutMs: 60_000 });
  if (!data || !Array.isArray(data.features)) throw new Error("Vegvesen: unexpected response shape");
  const byId = new Map<string, VegvesenRecord>();
  for (const f of data.features) {
    const r = f.properties;
    if (r?.RECORD_ID && !byId.has(r.RECORD_ID)) byId.set(r.RECORD_ID, r);
  }
  return [...byId.values()];
}

/**
 * Record types that are incidents. Everything else (works, traffic lights, speed limits,
 * diversions, planned closures …) is stored but not listed: in the dry-run of 2026-10-14
 * those were ~99 % of 2,773 records. Closures caused by an incident are a separate
 * management record of the same situation; the incident's description already says
 * "vegen er stengt".
 */
export const INCIDENT_TYPES = new Set([
  "Accident",
  "VehicleObstruction",
  "RoadsideAssistance",
  "GeneralObstruction",
  "AnimalPresenceObstruction",
  "EnvironmentalObstruction",
  "NonWeatherRelatedRoadConditions",
  "InfrastructureDamageObstruction",
  "PoorEnvironmentConditions",
]);

/** Cancelled ferries ("Ferje - Innstilt") are published as TransitInformation with severity "highest". */
export function isVegvesenIncident(subtype: string, severity: string | null): boolean {
  const type = subtype.split("/")[0];
  if (INCIDENT_TYPES.has(type)) return true;
  return type === "TransitInformation" && severity === "highest";
}

/** Ids of every record currently published (small: ids only). */
export async function fetchActiveRecordIds(): Promise<Set<string>> {
  const data = await fetchJson<FeatureCollection<{ RECORD_ID?: string }>>(wfsUrl(["RECORD_ID"]), { timeoutMs: 60_000 });
  if (!data || !Array.isArray(data.features)) throw new Error("Vegvesen: unexpected response shape");
  return new Set(data.features.map((f) => f.properties?.RECORD_ID).filter((id): id is string => !!id));
}

const firstSecondary = (s: string | null | undefined) =>
  (s ?? "")
    .split(/[,;\s]+/u)
    .map((x) => x.trim())
    .filter(Boolean)[0] ?? null;

/** DATEX situation record type (+ first secondary type) → our taxonomy. */
export function categorizeVegvesen(type: string | null | undefined, secondary: string | null | undefined): Category {
  const t = (type ?? "").trim();
  const s = (secondary ?? "").toLowerCase();
  if (t === "Accident" || /\baccident/u.test(s)) return "trafikkulykke";
  if (/vehiclefire|vehicleonfire|fire\b|smoke/u.test(s)) return "brann";
  if (t === "MaintenanceWorks" || t === "ConstructionWorks" || /roadworks|roadmaintenance|resurfacing/u.test(s)) return "vegarbeid";
  return "trafikk";
}

/** "… i Bjørnafjorden, Vestland, i retning mot …" → kommune (validated against the fylke). */
export function kommuneFromLocation(text: string | null | undefined) {
  if (!text) return null;
  // The fylke ends at a comma, a parenthesis, " - " (from–to descriptions) or the end.
  for (const m of text.matchAll(/(?:^|\s)i ([^,()]+?), ([^,()]+?)(?=\s*(?:,|$|\(|\s[-–]\s))/gu)) {
    const fylke = findFylke(m[2]);
    const kommune = findKommune(m[1], fylke ? [fylke.nr] : undefined);
    if (kommune && (!fylke || kommune.fylkeNr === fylke.nr)) return kommune;
  }
  return findKommuneInText(text);
}

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** One event per situation record. */
export function normalizeRecord(r: VegvesenRecord, now = new Date()): ParsedEvent {
  const lat = r.COORDINATES_FOR_DISPLAY_LATITUDE;
  const lng = r.COORDINATES_FOR_DISPLAY_LONGITUDE;
  const geo = typeof lat === "number" && typeof lng === "number" && lat > 50 && lng > 0 ? { lat, lng } : null;
  const kommune = kommuneFromLocation(r.LOCATION_DESCRIPTION);
  const end = toDate(r.END_TIME);
  const secondary = firstSecondary(r.SECONDARY_TYPES);
  const type = r.SITUATION_TYPE?.trim() || "Unknown";

  return {
    raw: r,
    event: {
      id: eventId("vegvesen", r.RECORD_ID),
      source: "vegvesen",
      sourceId: r.RECORD_ID,
      groupId: r.SITUATION_ID,
      sourceUrl: VEGVESEN_PAGE,
      attribution: VEGVESEN_ATTRIBUTION,
      kind: "hendelse",
      category: categorizeVegvesen(type, r.SECONDARY_TYPES),
      // "Accident/accident", "VehicleObstruction/brokenDownVehicle": the web maps codes to nb/en labels.
      subtype: secondary ? `${type}/${secondary}` : type,
      title: r.LOCATION_DESCRIPTION?.trim() || r.ROAD_NUMBER || type,
      summary: r.DESCRIPTION?.trim() || null,
      latest: null,
      startTime: toDate(r.START_TIME) ?? toDate(r.CREATION_DATE) ?? now,
      endTime: end,
      publishedAt: toDate(r.CREATION_DATE),
      updatedAtSource: toDate(r.LAST_UPDATE_TIME),
      status: end && end.getTime() < now.getTime() ? "avsluttet" : "aktiv",
      severity: r.SEVERITY ?? null,
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? null,
      fylkeNr: kommune?.fylkeNr ?? null,
      fylkeNavn: kommune?.fylkeNavn ?? null,
      kommuner: [],
      fylker: [],
      place: null,
      roadNumber: normalizeRoad(r.ROAD_NUMBER),
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "eksakt" : kommune ? "kommune" : "mangler",
      en: null,
    },
  };
}

/** "E39" → "E39", "R7" → "Rv7", "F1504" → "Fv1504", "K123" → "Kv123" (as signposted in Norway). */
export function normalizeRoad(road: string | null | undefined): string | null {
  const m = /^\s*([ERFKPS])\s*(\d+)\s*$/iu.exec(road ?? "");
  if (!m) return road?.trim() || null;
  const prefix = { E: "E", R: "Rv", F: "Fv", K: "Kv", P: "Pv", S: "Sv" }[m[1].toUpperCase() as "E"];
  return `${prefix}${m[2]}`;
}
