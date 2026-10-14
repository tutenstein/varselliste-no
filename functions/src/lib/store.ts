import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Firestore, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { NormalizedEvent, ParsedEvent, SourceId } from "./model";

export const EVENTS = "events";
export const RAW_EVENTS = "raw_events";
export const SOURCES = "sources";
export const INGEST_STATE = "ingest_state";

let db: Firestore | null = null;

export function firestore(): Firestore {
  if (!db) {
    if (!getApps().length) initializeApp();
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

/** Short, stable content hash used to skip unchanged writes. */
export function contentHash(event: NormalizedEvent): string {
  return createHash("sha1").update(JSON.stringify(event)).digest("hex").slice(0, 16);
}

export interface UpsertResult {
  written: number;
  unchanged: number;
  /** id -> hash for every event in the input (for the next run's comparison). */
  hashes: Record<string, string>;
}

/**
 * Writes normalized events (and their raw payload) to Firestore. Events whose
 * hash matches `known` are skipped, so frequent polling stays cheap.
 */
export async function upsertEvents(parsed: ParsedEvent[], known: Record<string, string> = {}): Promise<UpsertResult> {
  const store = firestore();
  const writer = store.bulkWriter();
  writer.onWriteError((err) => err.failedAttempts < 3);

  const hashes: Record<string, string> = {};
  const failed = new Set<string>();
  const pending: Promise<unknown>[] = [];
  const track = (id: string, write: Promise<unknown>) =>
    pending.push(
      write.catch((err: unknown) => {
        failed.add(id);
        logger.warn(`write failed for ${id}`, { error: String(err) });
      }),
    );
  let written = 0;
  let unchanged = 0;

  for (const { event, raw } of parsed) {
    const hash = contentHash(event);
    hashes[event.id] = hash;
    if (known[event.id] === hash) {
      unchanged++;
      continue;
    }
    const { id, ...fields } = event;
    track(
      id,
      writer.set(
        store.collection(EVENTS).doc(id),
        { ...fields, contentHash: hash, ingestedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
    );
    // Stored as a JSON string: Firestore cannot hold nested arrays (GeoJSON, WKT lists …).
    track(
      id,
      writer.set(store.collection(RAW_EVENTS).doc(id), {
        source: event.source,
        payload: JSON.stringify(raw),
        fetchedAt: FieldValue.serverTimestamp(),
      }),
    );
    written++;
  }

  await writer.close();
  await Promise.all(pending);
  // Failed ids are left out of the index so the next run writes them again.
  for (const id of failed) delete hashes[id];
  if (failed.size) throw new Error(`${failed.size} event writes failed (e.g. ${[...failed][0]})`);
  return { written, unchanged, hashes };
}

/** Marks events as ended (e.g. a warning that is no longer published). */
export async function markEnded(ids: string[], now: Date): Promise<number> {
  if (!ids.length) return 0;
  const store = firestore();
  const writer = store.bulkWriter();
  const results = ids.map((id) =>
    writer
      .update(store.collection(EVENTS).doc(id), {
        status: "avsluttet",
        endedObservedAt: now,
        ingestedAt: FieldValue.serverTimestamp(),
      })
      .then(
        () => true,
        (err: unknown) => {
          logger.warn(`markEnded failed for ${id}`, { error: String(err) });
          return false;
        },
      ),
  );
  await writer.close();
  return (await Promise.all(results)).filter(Boolean).length;
}

/**
 * The source withdrew the content (e.g. a Politiloggen thread whose messages were all
 * removed). The event stays as a tombstone (`removed: true`, no text) so the feed
 * publisher sees the change and drops it; the raw payload is deleted.
 */
export async function markRemoved(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const store = firestore();
  const writer = store.bulkWriter();
  const results = ids.flatMap((id) => [
    writer
      .set(
        store.collection(EVENTS).doc(id),
        { removed: true, title: "", summary: null, latest: null, place: null, en: null, ingestedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      .then(
        () => true,
        (err: unknown) => {
          logger.warn(`markRemoved failed for ${id}`, { error: String(err) });
          return false;
        },
      ),
    writer.delete(store.collection(RAW_EVENTS).doc(id)).then(
      () => false,
      () => false,
    ),
  ]);
  await writer.close();
  return (await Promise.all(results)).filter(Boolean).length;
}

export async function readState<T extends object>(source: SourceId): Promise<Partial<T>> {
  const snap = await firestore().collection(INGEST_STATE).doc(source).get();
  return (snap.data() as Partial<T> | undefined) ?? {};
}

export async function writeState(source: SourceId, state: object): Promise<void> {
  await firestore()
    .collection(INGEST_STATE)
    .doc(source)
    .set({ ...state, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export interface RunStats {
  fetched: number;
  written: number;
  unchanged: number;
  ended?: number;
  removed?: number;
  mode?: string;
  note?: string;
}

/**
 * Runs one ingest job and records its outcome in `sources/{source}` — the public
 * "last observed" status shown on the about page.
 */
export async function runIngest(source: SourceId, attribution: string, job: () => Promise<RunStats>): Promise<void> {
  const ref = firestore().collection(SOURCES).doc(source);
  const startedAt = new Date();
  try {
    const stats = await job();
    await ref.set(
      {
        attribution,
        lastRunAt: startedAt,
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        lastStats: stats,
      },
      { merge: true },
    );
    logger.info(`${source}: ingest ok`, stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ref.set(
      {
        attribution,
        lastRunAt: startedAt,
        lastErrorAt: new Date(),
        lastError: message.slice(0, 500),
        consecutiveFailures: FieldValue.increment(1),
      },
      { merge: true },
    );
    logger.error(`${source}: ingest failed`, { error: message });
  }
}
