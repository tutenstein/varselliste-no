import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { Category, eventId, ParsedEvent } from "../lib/model";
import { findFylke, findKommune, fylkerForDistrict, kommuneCentre } from "../lib/regions";

/**
 * Politiloggen API (Politiet): https://api.politiloggen.politiet.no/index.html
 * Licence NLOD 2.0 — attribution required; information withdrawn by the police
 * (e.g. personal data published by mistake) must be removed here too (NLOD §3).
 * The API "is under continuous development and the format may change without
 * notice", so parsing is defensive and the health check watches this source.
 * No documented rate limit; we poll every few minutes with an identifying User-Agent.
 */
export const POLITILOGGEN_API = "https://api.politiloggen.politiet.no";
export const POLITILOGGEN_ATTRIBUTION = "Kilde: Politiet (Politiloggen), NLOD 2.0";
export const POLITILOGGEN_PAGE = "https://www.politiet.no/politiloggen";

export type MessageType = "Draft" | "Published" | "Edited" | "Removed";

export interface ThreadMessage {
  id: string;
  text: string | null;
  createdOn: string;
  updatedOn?: string | null;
  hasImage?: boolean;
  previouslyIncludedImage?: boolean;
  type?: MessageType | null;
}

export interface MessageThread {
  id: string;
  district: string | null;
  districtId?: number | null;
  category: string | null;
  municipality: string | null;
  area: string | null;
  createdOn: string;
  updatedOn?: string | null;
  lastMessageOn?: string | null;
  isActive: boolean;
  messages: ThreadMessage[];
}

interface ThreadResponse {
  messageThreads?: MessageThread[];
  hasMoreResults?: boolean;
}

export interface ThreadQuery {
  /** Inclusive lower bound on the thread's time (DateTimeFrom). */
  from?: Date;
  to?: Date;
  take?: number;
  skip?: number;
}

export function threadsUrl(q: ThreadQuery = {}): string {
  const p = new URLSearchParams({
    SortByEnum: "LastMessageOn",
    SortByAsc: "false",
    Take: String(q.take ?? 200),
  });
  if (q.skip) p.set("Skip", String(q.skip));
  if (q.from || q.to) p.set("TimeSpanType", "Custom");
  if (q.from) p.set("DateTimeFrom", q.from.toISOString());
  if (q.to) p.set("DateTimeTo", q.to.toISOString());
  return `${POLITILOGGEN_API}/messagethreads?${p}`;
}

export async function fetchThreads(q: ThreadQuery = {}): Promise<{ threads: MessageThread[]; hasMore: boolean }> {
  // attempts: 2 — one retry after a pause, never a burst.
  const data = await fetchJson<ThreadResponse>(threadsUrl(q), { attempts: 2, timeoutMs: 30_000 });
  if (!data || !Array.isArray(data.messageThreads)) throw new Error("Politiloggen: unexpected response shape");
  return { threads: data.messageThreads, hasMore: data.hasMoreResults === true };
}

/** Same slug as politiet.no builds for its thread pages (the id alone identifies the thread). */
const ACCENTS = "àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìıİłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;";
const PLAIN = "aaaaaaaaaacccddeeeeeeeegghiiiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------";
function slugPart(s: string): string {
  return encodeURIComponent(
    s
      .toLowerCase()
      .replace(/\s+/gu, "-")
      .replace(/./gu, (c) => {
        const i = ACCENTS.indexOf(c);
        return i >= 0 ? PLAIN.charAt(i) : c;
      })
      .replace(/&/gu, "-og-")
      .replace(/[^\w-]+/gu, "")
      .replace(/--+/gu, "-")
      .replace(/^-+|-+$/gu, ""),
  );
}

export function threadUrl(t: MessageThread): string {
  const slug = [t.district, t.category, t.municipality, t.area].filter((s): s is string => !!s).map(slugPart).join("-");
  return `${POLITILOGGEN_PAGE}/hendelse/${encodeURIComponent(t.id)}/${slug}`;
}

const CRIME = new Set(["innbrudd", "tyveri", "voldshendelse", "ro og orden", "skadeverk"]);

/** Collision, run-off, overturned vehicle … in the message text of a "Trafikk"/"Ulykke" thread. */
export const TRAFFIC_ACCIDENT =
  /trafikkulykke|trafikkuhell|uhell|sammenstøt|personskade|materielle skader|kollisjon|kollidert|kollidere|påkjør|utforkjøring|kjørt ut|kjørt av veg|kjørt av vei|havnet i grøft|velt(et)?\b|bil(en)? på taket|front mot front|bilulykke|mc-ulykke|motorsykkelulykke|ulykke/iu;

/**
 * Speed checks, fines, drink/drug driving, licences seized … in a "Trafikk" thread.
 * Dry-run 2026-10-14: about two thirds of the non-accident "Trafikk" threads were enforcement.
 */
export const TRAFFIC_ENFORCEMENT =
  /forelegg|hastighet|fartskontroll|trafikkontroll|\bkontroll|promille|ruspåvirket|ruskjøring|ruskøyring|beruset|førerkort|beslaglagt|beslag|km\/t|anmeld|uten gyldig|kjøreforbud|bilbelte|mobilbruk|pågrepet/iu;

/** Road-related words that turn a "Vær" thread (rockslide over the road …) into a traffic disruption. */
const ROAD = /\bveg|\bvei|kjørefelt|kjørebane|trafikk|tunnel|\bbru\b|\bE\d|\bfv\b|\brv\b/iu;

/**
 * Police categories → our taxonomy. "Trafikk" is split on the message text: accidents,
 * enforcement (shown as crime, like the offences they are) and actual disruptions.
 */
export function categorizePolitiloggen(category: string | null, text: string): Category {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "brann") return "brann";
  if (c === "redning" || c === "savnet" || c === "sjø") return "redning";
  if (CRIME.has(c)) return "kriminalitet";
  if (c === "ulykke") return /trafikk|kjøretøy|\bbil|vogntog|lastebil|motorsykkel|syklist|fotgjenger/iu.test(text) ? "trafikkulykke" : "redning";
  if (c === "trafikk") {
    if (TRAFFIC_ACCIDENT.test(text)) return "trafikkulykke";
    if (TRAFFIC_ENFORCEMENT.test(text)) return "kriminalitet";
    return "trafikk";
  }
  if (c === "vær" && ROAD.test(text)) return "trafikk";
  return "annet"; // Arrangement, Dyr, Vær, Andre hendelser
}

/** Sub-label for the UI: enforcement threads keep the police category but are shown as such. */
export function politiloggenSubtype(category: string | null, ours: Category): string {
  const c = category?.trim() || "Andre hendelser";
  return c === "Trafikk" && ours === "kriminalitet" ? "Trafikkontroll" : c;
}

const visible = (m: ThreadMessage) => m.type !== "Removed" && m.type !== "Draft" && !!m.text?.trim();

export interface PolitiloggenResult {
  parsed: ParsedEvent[];
  /** Threads whose every message was removed by the police. */
  removedIds: string[];
}

export function normalizeThreads(threads: MessageThread[]): PolitiloggenResult {
  const parsed: ParsedEvent[] = [];
  const removedIds: string[] = [];
  for (const t of threads) {
    const p = normalizeThread(t);
    if (p) parsed.push(p);
    else removedIds.push(eventId("politiloggen", t.id));
  }
  return { parsed, removedIds };
}

/** One event per thread; null when nothing visible is left (all messages removed). */
export function normalizeThread(t: MessageThread): ParsedEvent | null {
  const messages = [...(t.messages ?? [])].filter(visible).sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  if (!messages.length) return null;

  const texts = messages.map((m) => m.text!.trim());
  const districtFylker = fylkerForDistrict(t.district);
  const kommune = findKommune(t.municipality, districtFylker);
  const fylke = kommune ? { nr: kommune.fylkeNr, navn: kommune.fylkeNavn } : districtFylker?.length === 1 ? findFylke(districtFylker[0]) : null;
  const geo = kommune ? kommuneCentre(kommune.nr) : null;
  const created = new Date(t.createdOn);
  const updated = t.lastMessageOn ? new Date(t.lastMessageOn) : t.updatedOn ? new Date(t.updatedOn) : created;
  const category = categorizePolitiloggen(t.category, texts.join(" "));
  const where = [t.municipality, t.area].filter(Boolean).join(", ");

  // Images are not copied; texts of removed messages are never stored.
  const raw = {
    ...t,
    messages: messages.map(({ id, text, createdOn, updatedOn, type }) => ({ id, text, createdOn, updatedOn, type })),
  };

  return {
    raw,
    event: {
      id: eventId("politiloggen", t.id),
      source: "politiloggen",
      sourceId: t.id,
      groupId: null,
      sourceUrl: threadUrl(t),
      attribution: POLITILOGGEN_ATTRIBUTION,
      kind: "hendelse",
      category,
      subtype: politiloggenSubtype(t.category, category),
      title: where ? `${t.category ?? ""}: ${where}` : (t.category ?? ""),
      summary: texts[0],
      latest: texts.length > 1 ? texts[texts.length - 1] : null,
      startTime: created,
      endTime: null,
      publishedAt: created,
      updatedAtSource: updated,
      status: t.isActive ? "aktiv" : "avsluttet",
      severity: null,
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? t.municipality ?? null,
      fylkeNr: fylke?.nr ?? null,
      fylkeNavn: fylke?.navn ?? null,
      kommuner: [],
      fylker: [],
      place: t.area?.trim() || null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "kommune" : fylke ? "fylke" : "mangler",
      en: null,
    },
  };
}
