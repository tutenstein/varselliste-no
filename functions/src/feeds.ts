import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { Category, EventStatus, GeoPrecision, NormalizedEvent, SourceId } from "./lib/model";
import { EVENTS, firestore, INGEST_STATE, SOURCES } from "./lib/store";
import { isVegvesenIncident } from "./sources/vegvesen";

/**
 * Public feeds for the website. Visitors never query `events` directly: this job
 * merges only what changed since the last run into a few compact documents, so a
 * page view costs one document read regardless of how many events exist.
 *
 *   feeds/live    – started within 48 h, plus every active warning (+ source status)
 *   feeds/week    – 2–7 days old
 *   feeds/month   – 7–30 days old (split into month, month-2 … when it grows past ~900 KB)
 */
export const FEEDS = "feeds";
export const FEED_DAYS = 30;
/** News links (NRK) are only kept for a week: the block shows recent headlines. */
export const NEWS_DAYS = 7;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Compact event shape shipped to browsers (short keys keep the payload small). */
export interface FeedEvent {
  id: string;
  s: SourceId;
  c: Category;
  t: string; // subtype
  ti: string; // title (Norwegian, as published)
  su: string | null; // summary, truncated
  la?: string; // latest update in a thread (Politiloggen), truncated
  st: number; // start, epoch ms
  en: number | null; // end, epoch ms
  up: number | null; // last update at source, epoch ms
  x: EventStatus;
  sv: string | null; // severity
  k: string | null; // kommune number
  f: string | null; // fylke number
  ks?: string[]; // every kommune an area warning covers
  fs?: string[]; // every fylke an area warning covers
  pl?: string; // place within the kommune (Politiloggen `area`)
  r: string | null; // road number
  g: [number, number] | null; // [lat, lng]
  gp: GeoPrecision;
  u: string | null; // source url
  e?: { ti: string; su: string | null }; // English text when the source has it
}

/** Shape of an `events` document as read back from Firestore. */
export type StoredEvent = Omit<NormalizedEvent, "id" | "startTime" | "endTime" | "updatedAtSource" | "publishedAt"> & {
  startTime: Timestamp;
  endTime: Timestamp | null;
  updatedAtSource: Timestamp | null;
  publishedAt: Timestamp | null;
  ingestedAt?: Timestamp;
  /** Withdrawn by the source (e.g. every message of a police thread removed). */
  removed?: boolean;
};

const SUMMARY_MAX = 280;
const LATEST_MAX = 200;
const MAX_PART_BYTES = 900_000;
const isWarning = (c: Category) => c === "farevarsel" || c === "nodvarsel";

export function isFeedEligible(e: StoredEvent, now: Date): boolean {
  if (e.removed) return false;
  const start = e.startTime.toMillis();
  const nowMs = now.getTime();
  if (isWarning(e.category)) return e.status === "aktiv" || start >= nowMs - FEED_DAYS * DAY;
  if (start > nowMs + HOUR) return false; // planned for the future
  if (e.kind === "nyhet") return start >= nowMs - NEWS_DAYS * DAY;
  if (start < nowMs - FEED_DAYS * DAY) return false;

  switch (e.source) {
    case "politiloggen":
      // Everything politiet.no shows, crime included (decision 2026-10-14).
      return true;
    case "vegvesen":
      return isVegvesenIncident(e.subtype, e.severity);
    default:
      return false;
  }
}

const ms = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null);

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const clean = s.replace(/\s+\n/gu, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function toFeedEvent(id: string, e: StoredEvent): FeedEvent {
  const feed: FeedEvent = {
    id,
    s: e.source,
    c: e.category,
    t: e.subtype,
    ti: e.title,
    su: truncate(e.summary, SUMMARY_MAX),
    st: e.startTime.toMillis(),
    en: ms(e.endTime),
    up: ms(e.updatedAtSource),
    x: e.status,
    sv: e.severity,
    k: e.kommuneNr,
    f: e.fylkeNr,
    r: e.roadNumber,
    g: e.geo ? [Math.round(e.geo.lat * 1e4) / 1e4, Math.round(e.geo.lng * 1e4) / 1e4] : null,
    gp: e.geoPrecision,
    u: e.sourceUrl,
  };
  const latest = truncate(e.latest, LATEST_MAX);
  if (latest) feed.la = latest;
  if (e.kommuner?.length) feed.ks = e.kommuner;
  if (e.fylker?.length) feed.fs = e.fylker;
  if (e.place) feed.pl = e.place;
  if (e.en) feed.e = { ti: e.en.title, su: truncate(e.en.summary, SUMMARY_MAX) };
  return feed;
}

export type Shard = "live" | "week" | "month";
export const SHARDS: Shard[] = ["live", "week", "month"];

export function shardOf(ev: FeedEvent, now: Date): Shard | null {
  const age = now.getTime() - ev.st;
  if (isWarning(ev.c) && ev.x === "aktiv") return "live";
  if (age <= 2 * DAY) return "live";
  if (age <= 7 * DAY) return "week";
  if (age <= FEED_DAYS * DAY) return "month";
  return null;
}

export function partition(events: Iterable<FeedEvent>, now: Date): Record<Shard, FeedEvent[]> {
  const out: Record<Shard, FeedEvent[]> = { live: [], week: [], month: [] };
  for (const ev of events) {
    const shard = shardOf(ev, now);
    if (shard) out[shard].push(ev);
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.st - a.st);
  return out;
}

/** Splits a newest-first list into parts of at most `maxBytes` of JSON each. */
export function splitBySize(events: FeedEvent[], maxBytes = MAX_PART_BYTES): FeedEvent[][] {
  const parts: FeedEvent[][] = [[]];
  let size = 2;
  for (const ev of events) {
    const bytes = Buffer.byteLength(JSON.stringify(ev)) + 1;
    if (size + bytes > maxBytes && parts[parts.length - 1].length) {
      parts.push([]);
      size = 2;
    }
    parts[parts.length - 1].push(ev);
    size += bytes;
  }
  return parts;
}

/** feeds/month, feeds/month-2, … */
export const partDocId = (shard: Shard, index: number) => (index === 0 ? shard : `${shard}-${index + 1}`);

interface FeedDoc {
  data?: string;
  hash?: string;
  parts?: number;
}

interface PublisherState {
  cursor: Timestamp;
  version: number;
  /** Number of parts written per shard in the previous run (to delete parts no longer needed). */
  parts: Partial<Record<Shard, number>>;
}

/** Bump when eligibility or the feed format changes: the next run rebuilds the feeds from scratch. */
export const FEED_VERSION = 1;

/** Re-read window behind the cursor: serverTimestamp commits can land slightly out of order. */
const CURSOR_OVERLAP_MS = 60_000;

async function changedEvents(cursor: Timestamp | undefined, now: Date) {
  const col = firestore().collection(EVENTS);
  if (cursor) {
    const since = Timestamp.fromMillis(cursor.toMillis() - CURSOR_OVERLAP_MS);
    return (await col.where("ingestedAt", ">", since).orderBy("ingestedAt").limit(5000).get()).docs;
  }
  // First run: everything recent, plus long-running active warnings.
  const since = Timestamp.fromMillis(now.getTime() - FEED_DAYS * DAY);
  const [recent, warnings, alerts] = await Promise.all([
    col.where("startTime", ">=", since).get(),
    col.where("category", "==", "farevarsel").where("status", "==", "aktiv").get(),
    col.where("category", "==", "nodvarsel").where("status", "==", "aktiv").get(),
  ]);
  return [...recent.docs, ...warnings.docs, ...alerts.docs];
}

export async function runPublishJob(now = new Date()) {
  const db = firestore();
  const stateRef = db.collection(INGEST_STATE).doc("publisher");
  const state = ((await stateRef.get()).data() ?? {}) as Partial<PublisherState>;
  const rebuild = state.version !== FEED_VERSION;
  const prevParts = state.parts ?? {};

  // Every part document currently in use, keyed by doc id.
  const partIds = SHARDS.flatMap((s) => Array.from({ length: prevParts[s] ?? 1 }, (_, i) => partDocId(s, i)));
  const partRefs = partIds.map((id) => db.collection(FEEDS).doc(id));
  const [docs, partSnaps, sourceSnaps] = await Promise.all([
    changedEvents(rebuild ? undefined : state.cursor, now),
    db.getAll(...partRefs),
    db.collection(SOURCES).get(),
  ]);
  const existing = new Map(partIds.map((id, i) => [id, partSnaps[i].data() as FeedDoc | undefined]));

  // Current feed content, keyed by id.
  const current = new Map<string, FeedEvent>();
  if (!rebuild) {
    for (const doc of existing.values()) {
      if (doc?.data) for (const ev of JSON.parse(doc.data) as FeedEvent[]) current.set(ev.id, ev);
    }
  }

  let cursor = rebuild ? undefined : state.cursor;
  for (const doc of docs) {
    const e = doc.data() as StoredEvent;
    if (isFeedEligible(e, now)) current.set(doc.id, toFeedEvent(doc.id, e));
    else current.delete(doc.id);
    if (e.ingestedAt && (!cursor || e.ingestedAt.toMillis() > cursor.toMillis())) cursor = e.ingestedAt;
  }

  const shards = partition(current.values(), now);
  const sources = Object.fromEntries(
    sourceSnaps.docs.map((d) => {
      const s = d.data();
      return [
        d.id,
        {
          ok: ms(s.lastSuccessAt),
          err: ms(s.lastErrorAt),
          fails: s.consecutiveFailures ?? 0,
          attribution: s.attribution ?? null,
        },
      ];
    }),
  );

  const batch = db.batch();
  let written = 0;
  const parts: Record<Shard, number> = { live: 1, week: 1, month: 1 };
  for (const shard of SHARDS) {
    const chunks = splitBySize(shards[shard]);
    parts[shard] = chunks.length;
    chunks.forEach((chunk, i) => {
      const id = partDocId(shard, i);
      const data = JSON.stringify(chunk);
      const hash = createHash("sha1").update(data).digest("hex").slice(0, 16);
      const extra = shard === "live" && i === 0 ? { sources: JSON.stringify(sources) } : {};
      const old = existing.get(id);
      // The live doc always gets a fresh timestamp: it doubles as the "last checked" signal.
      if (old?.hash === hash && old.parts === (i === 0 ? chunks.length : undefined) && !(shard === "live" && i === 0)) return;
      batch.set(db.collection(FEEDS).doc(id), {
        v: 1,
        data,
        hash,
        count: chunk.length,
        ...(i === 0 ? { parts: chunks.length } : {}),
        generatedAt: FieldValue.serverTimestamp(),
        ...extra,
      });
      written++;
    });
    // Parts that are no longer needed.
    for (let i = chunks.length; i < (prevParts[shard] ?? 1); i++) batch.delete(db.collection(FEEDS).doc(partDocId(shard, i)));
  }
  batch.set(
    stateRef,
    { cursor: cursor ?? Timestamp.fromDate(now), version: FEED_VERSION, parts, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  await batch.commit();

  return {
    rebuild,
    changed: docs.length,
    live: shards.live.length,
    week: shards.week.length,
    month: shards.month.length,
    parts,
    shardsWritten: written,
  };
}
