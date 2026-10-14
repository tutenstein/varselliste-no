// Client for the precomputed feeds written by the `publishFeeds` Cloud Function.
// One Firestore REST GET per shard — no SDK, no queries against the event store.

export type Category =
  | "trafikkulykke"
  | "brann"
  | "redning"
  | "trafikk"
  | "kriminalitet"
  | "annet"
  | "farevarsel"
  | "nodvarsel"
  | "vegarbeid";
export type SourceId = "politiloggen" | "vegvesen" | "metalerts" | "nve" | "nodvarsel" | "nrk";
export type Shard = "live" | "week" | "month";

export interface FeedEvent {
  id: string;
  s: SourceId;
  c: Category;
  t: string; // subtype
  ti: string; // title, as published (Norwegian)
  su: string | null; // summary
  la?: string; // latest update in a police thread
  st: number;
  en: number | null;
  up: number | null;
  x: "aktiv" | "avsluttet" | "ukjent";
  sv: string | null; // severity
  k: string | null; // kommune
  f: string | null; // fylke
  ks?: string[]; // kommuner an area warning covers
  fs?: string[]; // fylker an area warning covers
  pl?: string; // place within the kommune (police "area")
  r: string | null; // road
  g: [number, number] | null;
  gp: "eksakt" | "omrade" | "kommune" | "fylke" | "mangler";
  u: string | null;
  e?: { ti: string; su: string | null };
}

export interface SourceStatus {
  ok: number | null;
  err: number | null;
  fails: number;
  attribution: string | null;
}

export interface FeedShard {
  events: FeedEvent[];
  generatedAt: number | null;
  sources: Record<string, SourceStatus> | null;
}

const PROJECT = "varselliste-no";
export const FEED_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/feeds`;

export function feedUrl(docId: string): string {
  return `${FEED_BASE}/${docId}?mask.fieldPaths=data&mask.fieldPaths=sources&mask.fieldPaths=generatedAt&mask.fieldPaths=parts`;
}

interface FirestoreDoc {
  fields?: {
    data?: { stringValue?: string };
    sources?: { stringValue?: string };
    generatedAt?: { timestampValue?: string };
    parts?: { integerValue?: string };
  };
}

export function parseFeedDoc(doc: FirestoreDoc): FeedShard & { parts: number } {
  const f = doc.fields ?? {};
  return {
    events: f.data?.stringValue ? (JSON.parse(f.data.stringValue) as FeedEvent[]) : [],
    generatedAt: f.generatedAt?.timestampValue ? Date.parse(f.generatedAt.timestampValue) : null,
    sources: f.sources?.stringValue ? (JSON.parse(f.sources.stringValue) as Record<string, SourceStatus>) : null,
    parts: Number(f.parts?.integerValue ?? 1),
  };
}

async function fetchDoc(docId: string): Promise<FeedShard & { parts: number }> {
  const res = await fetch(feedUrl(docId), { cache: "no-store" });
  if (!res.ok) throw new Error(`feed ${docId}: HTTP ${res.status}`);
  return parseFeedDoc((await res.json()) as FirestoreDoc);
}

/** A shard and, when it has grown past one document, its extra parts (month-2, …). */
export async function fetchShard(shard: Shard, first?: Promise<FeedShard & { parts: number }>): Promise<FeedShard> {
  const head = await (first ?? fetchDoc(shard));
  if (head.parts <= 1) return head;
  const rest = await Promise.all(Array.from({ length: head.parts - 1 }, (_, i) => fetchDoc(`${shard}-${i + 2}`)));
  return { ...head, events: [head.events, ...rest.map((r) => r.events)].flat() };
}

// ---------------------------------------------------------------- kinds

export const isWarning = (ev: FeedEvent) => ev.c === "farevarsel" || ev.c === "nodvarsel";
export const isNews = (ev: FeedEvent) => ev.s === "nrk";

// ---------------------------------------------------------------- filtering

export type Range = "24h" | "7d" | "30d";
export const RANGE_MS: Record<Range, number> = { "24h": 24 * 3600_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000 };
export const shardsFor = (range: Range): Shard[] =>
  range === "24h" ? ["live"] : range === "7d" ? ["live", "week"] : ["live", "week", "month"];

export interface Filters {
  range: Range;
  categories: Set<Category>; // empty = all
  fylke: string | null;
  kommune: string | null;
  q: string;
  near: { lat: number; lng: number; km: number } | null;
}

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Lower case with æ→ae, ø→o, å→a and other diacritics folded (so "tromso" finds Tromsø),
 * and Norwegian road numbers joined: "Fv. 1504" / "fv 1504" / "F1504" → "fv1504",
 * "Rv 7" / "R7" → "rv7", "E 6" → "e6".
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/gu, "ae")
    .replace(/ø/gu, "o")
    .replace(/å/gu, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/(?<![a-z0-9])(e|rv|fv|kv|r|f|k)\.?\s?(?=\d)/gu, (_, p: string) => ({ r: "rv", f: "fv", k: "kv" })[p] ?? p);
}

/** Road numbers ("E6", "rv7", "fv1504") and bare numbers must match a whole token, so "E6" doesn't find E69. */
const ROAD_LIKE = /^((e|rv|fv|kv)\d{1,5}|\d{1,5})$/u;

export function matchesQuery(q: string, text: string): boolean {
  const words = normalizeText(q).split(/\s+/u).filter(Boolean);
  const hay = normalizeText(text);
  const tokens = new Set(hay.split(/[^a-z0-9]+/u));
  return words.every((w) => (ROAD_LIKE.test(w) ? tokens.has(w) : hay.includes(w)));
}

/** Does an event belong to a kommune / fylke page? Area warnings count for every kommune they cover. */
export function inKommune(ev: FeedEvent, kommune: string): boolean {
  if (ev.k === kommune) return true;
  if (!isWarning(ev)) return false;
  if (ev.ks?.length) return ev.ks.includes(kommune);
  return !!ev.fs?.includes(kommune.slice(0, 2)) || ev.f === kommune.slice(0, 2);
}

export function inFylke(ev: FeedEvent, fylke: string): boolean {
  return ev.f === fylke || !!ev.fs?.includes(fylke) || (!!ev.k && ev.k.slice(0, 2) === fylke && !ev.f);
}

/** Everything except the category filter (used for the category counts). */
export function matchesScope(ev: FeedEvent, f: Filters, now: number, searchText: (ev: FeedEvent) => string): boolean {
  const isActiveWarning = isWarning(ev) && ev.x === "aktiv";
  if (!isActiveWarning && now - ev.st > RANGE_MS[f.range]) return false;
  if (f.kommune && !inKommune(ev, f.kommune)) return false;
  if (f.fylke && !inFylke(ev, f.fylke)) return false;
  if (f.near) {
    if (!ev.g || ev.gp === "fylke" || ev.gp === "mangler") return false;
    if (distanceKm([f.near.lat, f.near.lng], ev.g) > f.near.km) return false;
  }
  if (f.q && !matchesQuery(f.q, searchText(ev))) return false;
  return true;
}

export function mergeShards(shards: FeedShard[]): FeedEvent[] {
  const byId = new Map<string, FeedEvent>();
  for (const sh of shards) for (const ev of sh.events) byId.set(ev.id, ev);
  return [...byId.values()].sort((a, b) => b.st - a.st);
}
