import { fetchText } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { eventId, ParsedEvent } from "../lib/model";
import { findKommune, findKommuneInText, kommuneCentre } from "../lib/regions";
import { parseRss, RssItem, rssDate } from "../lib/rss";

/**
 * Nødvarsel (DSB): public emergency alerts sent by cell broadcast.
 * Terms for the RSS feeds (https://www.nodvarsel.no/rss/): free to use; state clearly
 * that the data comes from nodvarsel.no, keep it apart from our own content and show a
 * visible, clickable link to nodvarsel.no. The feed has no area — only the title
 * ("Brann, Sortland") — so the kommune is taken from the title.
 */
export const NODVARSEL_ACTIVE = "https://www.nodvarsel.no/rss/rss-aktive-nodvarsler/";
export const NODVARSEL_PAST = "https://www.nodvarsel.no/rss/rss-tidligere-nodvarsler/";
export const NODVARSEL_ATTRIBUTION = "Kilde: nodvarsel.no (DSB)";

export async function fetchNodvarsel(which: "active" | "past"): Promise<RssItem[]> {
  const res = await fetchText(which === "active" ? NODVARSEL_ACTIVE : NODVARSEL_PAST, {
    headers: { Accept: "application/rss+xml, application/xml" },
    attempts: 2,
  });
  if (!/<rss[\s>]/u.test(res.text)) throw new Error("Nødvarsel: not an RSS document");
  return parseRss(res.text);
}

/** Test alerts and the national test day are not real alerts. */
export const isTestAlert = (item: RssItem) => /\btest\b|varslingsprøve|varslingsprove/iu.test(`${item.title} ${item.link ?? ""}`);

/** "https://www.nodvarsel.no/tidligere-varsler/brann-sortland/" → "brann-sortland". */
export function alertSlug(item: RssItem): string {
  const url = item.guid ?? item.link ?? item.title;
  const parts = url.split("/").filter(Boolean);
  return (parts[parts.length - 1] ?? url).replace(/[^\w-]/gu, "").slice(0, 120) || "ukjent";
}

export function normalizeNodvarsel(item: RssItem, active: boolean, now = new Date()): ParsedEvent {
  const title = item.title.trim();
  const parts = title.split(",").map((p) => p.trim());
  const kommune = (parts.length > 1 ? findKommune(parts[parts.length - 1]) : null) ?? findKommuneInText(title);
  const geo = kommune ? kommuneCentre(kommune.nr) : null;
  const time = rssDate(item) ?? now;
  const slug = alertSlug(item);

  return {
    raw: { title: item.title, link: item.link, guid: item.guid, updated: item.updated },
    event: {
      id: eventId("nodvarsel", slug),
      source: "nodvarsel",
      sourceId: slug,
      groupId: null,
      sourceUrl: item.link ?? "https://www.nodvarsel.no/",
      attribution: NODVARSEL_ATTRIBUTION,
      kind: "varsel",
      category: "nodvarsel",
      subtype: parts[0] || "Nødvarsel",
      title,
      summary: null,
      latest: null,
      startTime: time,
      endTime: null,
      publishedAt: time,
      updatedAtSource: time,
      status: active ? "aktiv" : "avsluttet",
      severity: "red",
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? null,
      fylkeNr: kommune?.fylkeNr ?? null,
      fylkeNavn: kommune?.fylkeNavn ?? null,
      kommuner: kommune ? [kommune.nr] : [],
      fylker: kommune ? [kommune.fylkeNr] : [],
      place: null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "kommune" : "mangler",
      en: null,
    },
  };
}
