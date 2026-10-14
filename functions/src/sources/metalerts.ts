import { fetchText, HttpError } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { eventId, ParsedEvent } from "../lib/model";
import { centreOfKommuner, findFylke, kommuneByNr } from "../lib/regions";

/**
 * MET Norway MetAlerts 2.0: https://api.met.no/weatherapi/metalerts/2.0/documentation
 * Licence CC BY 4.0 / NLOD 2.0 — credit MET Norway.
 * Terms (https://api.met.no/doc/TermsOfService): identifying User-Agent with contact
 * details, If-Modified-Since, no polling more often than every 10 minutes for alerts.
 * Only land alerts: marine gale warnings (most of the feed) are out of scope.
 */
export const METALERTS_API = "https://api.met.no/weatherapi/metalerts/2.0";
export const METALERTS_ATTRIBUTION = "Kilde: MET Norway (Meteorologisk institutt), CC BY 4.0";
export const METALERTS_PAGE = "https://www.yr.no/nb/farevarsler";

export interface MetAlertFeature {
  properties: {
    id: string;
    type?: string; // Alert | Update | Cancel
    status?: string; // Actual | Test
    event?: string;
    eventAwarenessName?: string;
    awareness_level?: string; // "2; yellow; Moderate"
    riskMatrixColor?: string;
    severity?: string;
    title?: string;
    area?: string;
    description?: string;
    instruction?: string;
    consequences?: string;
    county?: string[];
    municipality?: string[];
    geographicDomain?: string;
    eventEndingTime?: string;
    web?: string;
  };
  when?: { interval?: [string, string] };
}

interface MetAlertsCollection {
  features?: MetAlertFeature[];
  lastChange?: string;
}

export interface MetAlertsFetch {
  /** null when the server answered 304 Not Modified. */
  features: MetAlertFeature[] | null;
  lastModified: string | null;
}

/**
 * `current` = active alerts; `all` = active and expired alerts of the last 30 days
 * (used once to fill the history).
 */
export async function fetchMetAlerts(
  kind: "current" | "all",
  lang: "no" | "en",
  ifModifiedSince?: string | null,
): Promise<MetAlertsFetch> {
  const url = `${METALERTS_API}/${kind}.json?lang=${lang}&geographicDomain=land`;
  const res = await fetchText(url, {
    headers: { Accept: "application/json", ...(ifModifiedSince ? { "If-Modified-Since": ifModifiedSince } : {}) },
    timeoutMs: 30_000,
    attempts: 2,
  });
  if (res.status === 304) return { features: null, lastModified: ifModifiedSince ?? null };
  const data = JSON.parse(res.text) as MetAlertsCollection;
  if (!data || !Array.isArray(data.features)) throw new HttpError(res.status, url, "MetAlerts: unexpected response shape");
  return { features: data.features, lastModified: res.headers.get("last-modified") };
}

/** "2; yellow; Moderate" → "yellow". */
export function awarenessColor(p: MetAlertFeature["properties"]): string | null {
  const fromLevel = p.awareness_level?.split(";")[1]?.trim().toLowerCase();
  return fromLevel || p.riskMatrixColor?.toLowerCase() || null;
}

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const headline = (p: MetAlertFeature["properties"]) => [p.eventAwarenessName ?? p.event, p.area].filter(Boolean).join(" – ");

/**
 * One event per alert. `english` holds the same alerts fetched with lang=en (matched
 * on id); `active` says whether the alert is in the current list.
 */
export function normalizeMetAlert(f: MetAlertFeature, english: MetAlertFeature | undefined, active: boolean, now = new Date()): ParsedEvent {
  const p = f.properties;
  const kommuner = [...new Set((p.municipality ?? []).filter((nr) => kommuneByNr(nr)))].sort();
  const fylker = [...new Set((p.county ?? []).map((c) => findFylke(c)?.nr).filter((nr): nr is string => !!nr))].sort();
  const kommune = kommuner.length === 1 ? kommuneByNr(kommuner[0]) : null;
  const fylke = fylker.length === 1 ? findFylke(fylker[0]) : null;
  const geo = centreOfKommuner(kommuner);
  const [from, to] = f.when?.interval ?? [];
  const end = toDate(to) ?? toDate(p.eventEndingTime);
  const en = english?.properties;

  // The map image and CAP links are not needed; the polygon is not stored.
  return {
    raw: { properties: p, when: f.when },
    event: {
      id: eventId("metalerts", p.id),
      source: "metalerts",
      sourceId: p.id,
      groupId: null,
      sourceUrl: METALERTS_PAGE,
      attribution: METALERTS_ATTRIBUTION,
      kind: "varsel",
      category: "farevarsel",
      subtype: p.event ?? "weather",
      title: headline(p),
      summary: p.description?.trim() || null,
      latest: null,
      startTime: toDate(from) ?? now,
      endTime: end,
      publishedAt: null,
      updatedAtSource: null,
      status: active && !(end && end.getTime() < now.getTime()) ? "aktiv" : "avsluttet",
      severity: awarenessColor(p),
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? null,
      fylkeNr: fylke?.nr ?? null,
      fylkeNavn: fylke?.navn ?? null,
      kommuner,
      fylker,
      place: null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "omrade" : "mangler",
      en: en ? { title: headline(en), summary: en.description?.trim() || null } : null,
    },
  };
}

/** Actual (non-test) alerts only. */
export const isActual = (f: MetAlertFeature) => (f.properties.status ?? "Actual") === "Actual";
