import { sleep } from "./lib/http";
import { ParsedEvent } from "./lib/model";
import { EVENTS, firestore, markEnded, markRemoved, readState, RunStats, upsertEvents, writeState } from "./lib/store";
import { backfillDays, osloDayRange } from "./lib/time";
import { fetchThreads, MessageThread, normalizeThreads } from "./sources/politiloggen";
import { fetchActiveRecordIds, fetchRecords, normalizeRecord } from "./sources/vegvesen";
import { fetchMetAlerts, isActual, MetAlertFeature, normalizeMetAlert } from "./sources/metalerts";
import { fetchNveWarnings, Hazard, normalizeNve } from "./sources/nve";
import { fetchNodvarsel, isTestAlert, normalizeNodvarsel } from "./sources/nodvarsel";
import { fetchNrk, normalizeNrk } from "./sources/news";

const MINUTE = 60_000;

/** Keeps only the hashes of the ids in `parsed` (state documents stay small). */
const hashesOf = (hashes: Record<string, string>, ids: Iterable<string>) => {
  const out: Record<string, string> = {};
  for (const id of ids) if (hashes[id]) out[id] = hashes[id];
  return out;
};

// ---------------------------------------------------------------- Politiloggen

/**
 * Bump when normalization changes in a way that should be applied to already stored
 * history (e.g. a new category rule). The backfill then runs again.
 */
export const BACKFILL_VERSION = 1;

interface BackfillState {
  version?: number;
  pending: string[]; // days "YYYY-MM-DD", newest first
  done: { day: string; count: number }[];
  startedAt: Date;
  completedAt: Date | null;
}

interface PolitiloggenState {
  hashes: Record<string, string>;
  /** Newest `lastMessageOn` seen (ISO). */
  cursor: string;
  backfill: BackfillState;
}

const LIVE_PAGE = 200;
const LIVE_MAX_PAGES = 3;
/** Pause between two calls in the same run — no bursts against a source without a documented limit. */
const POLITILOGGEN_PAUSE_MS = 5_000;

const threadTime = (t: MessageThread) => t.lastMessageOn ?? t.updatedOn ?? t.createdOn;

/**
 * Every run: the threads with the newest messages (200, more pages only if all of them
 * are newer than the previous run's cursor). While the backfill is pending, one past
 * day per run. Threads whose every message was removed are withdrawn here too (NLOD §3).
 */
export async function runPolitiloggenJob(now = new Date()): Promise<RunStats> {
  const state = await readState<PolitiloggenState>("politiloggen");
  const cursor = state.cursor ?? "";

  const threads: MessageThread[] = [];
  for (let page = 0; page < LIVE_MAX_PAGES; page++) {
    if (page > 0) await sleep(POLITILOGGEN_PAUSE_MS);
    const { threads: batch, hasMore } = await fetchThreads({ take: LIVE_PAGE, skip: page * LIVE_PAGE });
    threads.push(...batch);
    const oldest = batch.length ? threadTime(batch[batch.length - 1]) : "";
    if (!hasMore || !cursor || oldest <= cursor) break;
  }

  const { parsed, removedIds } = normalizeThreads(threads);
  const live = await upsertEvents(parsed, state.hashes ?? {});
  const removed = await markRemoved(removedIds);
  const stats: RunStats = { fetched: threads.length, written: live.written, unchanged: live.unchanged, removed, mode: "live" };

  let backfill = state.backfill;
  if (!backfill || (backfill.version ?? 0) < BACKFILL_VERSION) {
    const days = Number(process.env.BACKFILL_DAYS ?? 30);
    backfill = { version: BACKFILL_VERSION, pending: backfillDays(now, days), done: [], startedAt: now, completedAt: null };
  }
  if (backfill.pending.length > 0) {
    await sleep(POLITILOGGEN_PAUSE_MS);
    const day = backfill.pending[0];
    const [from, to] = osloDayRange(day);
    const { threads: past } = await fetchThreads({ from, to, take: 1000 });
    const result = normalizeThreads(past);
    const dayResult = await upsertEvents(result.parsed, live.hashes);
    stats.removed = (stats.removed ?? 0) + (await markRemoved(result.removedIds));
    backfill = {
      ...backfill,
      pending: backfill.pending.slice(1),
      done: [...backfill.done, { day, count: past.length }].slice(-60),
      completedAt: backfill.pending.length === 1 ? new Date() : null,
    };
    stats.fetched += past.length;
    stats.written += dayResult.written;
    stats.unchanged += dayResult.unchanged;
    stats.mode = `live+backfill ${day} (${backfill.pending.length} igjen)`;
  }

  const newest = threads.map(threadTime).sort().pop() ?? cursor;
  await writeState("politiloggen", {
    hashes: hashesOf(live.hashes, parsed.map((p) => p.event.id)),
    cursor: newest > cursor ? newest : cursor,
    backfill,
  });
  return stats;
}

// ---------------------------------------------------------------- Statens vegvesen

interface VegvesenState {
  /** Upper bound of the last delta (ISO). */
  since: string;
  /** Record ids in the last full snapshot. */
  activeIds: string[];
  lastFullAt: string;
}

/** Overlap for the delta query: the WFS may publish records slightly after their update time. */
const VEGVESEN_OVERLAP_MS = 3 * MINUTE;
const VEGVESEN_FULL_EVERY_MS = 30 * MINUTE;

/**
 * First run: every record. Later runs: records updated since the previous run. Every 30
 * minutes an id-only snapshot tells which records are gone (= ended).
 */
export async function runVegvesenJob(now = new Date()): Promise<RunStats> {
  const state = await readState<VegvesenState>("vegvesen");
  const since = state.since ? new Date(new Date(state.since).getTime() - VEGVESEN_OVERLAP_MS) : undefined;
  const records = await fetchRecords(since);
  const parsed = records.map((r) => normalizeRecord(r, now));
  const result = await upsertEvents(parsed);

  let ended = 0;
  let activeIds = state.activeIds ?? [];
  let lastFullAt = state.lastFullAt ?? "";
  const fullDue = !since || !lastFullAt || now.getTime() - new Date(lastFullAt).getTime() >= VEGVESEN_FULL_EVERY_MS;
  if (fullDue) {
    const active = since ? await fetchActiveRecordIds() : new Set(records.map((r) => r.RECORD_ID));
    const gone = activeIds.filter((id) => !active.has(id)).map((id) => `vegvesen-${id}`);
    ended = await markEnded(gone, now);
    activeIds = [...active];
    lastFullAt = now.toISOString();
  } else {
    // Records seen in a delta are active until the next snapshot says otherwise.
    activeIds = [...new Set([...activeIds, ...records.map((r) => r.RECORD_ID)])];
  }

  await writeState("vegvesen", { since: now.toISOString(), activeIds, lastFullAt });
  return { fetched: records.length, written: result.written, unchanged: result.unchanged, ended, mode: since ? (fullDue ? "delta+snapshot" : "delta") : "initial" };
}

// ---------------------------------------------------------------- MET MetAlerts

interface MetAlertsState {
  lastModified: string | null;
  hashes: Record<string, string>;
  /** The 30-day history (all.json) has been loaded once. */
  historyLoaded: boolean;
}

/**
 * Every 10 minutes (MET's terms): current alerts with If-Modified-Since — usually a 304.
 * On change, the English list too. Alerts that leave the current list have ended.
 */
export async function runMetAlertsJob(now = new Date()): Promise<RunStats> {
  const state = await readState<MetAlertsState>("metalerts");
  const stats: RunStats = { fetched: 0, written: 0, unchanged: 0, ended: 0, mode: "live" };

  if (!state.historyLoaded) {
    const [no, en] = [await fetchMetAlerts("all", "no"), await fetchMetAlerts("all", "en")];
    const history = toParsed(no.features ?? [], en.features ?? [], new Set(), now);
    const result = await upsertEvents(history);
    stats.fetched += history.length;
    stats.written += result.written;
    stats.mode = "history+live";
    await writeState("metalerts", { historyLoaded: true });
  }

  const no = await fetchMetAlerts("current", "no", state.historyLoaded ? state.lastModified : null);
  if (!no.features) return { ...stats, mode: "not modified" };
  const en = await fetchMetAlerts("current", "en");
  const activeIds = new Set(no.features.map((f) => f.properties.id));
  const parsed = toParsed(no.features, en.features ?? [], activeIds, now);
  const result = await upsertEvents(parsed, state.hashes ?? {});

  const goneIds = Object.keys(state.hashes ?? {}).filter((id) => !(id in result.hashes));
  stats.ended = await markEnded(goneIds, now);
  stats.fetched += parsed.length;
  stats.written += result.written;
  stats.unchanged += result.unchanged;

  await writeState("metalerts", { lastModified: no.lastModified, hashes: result.hashes, historyLoaded: true });
  return stats;
}

function toParsed(no: MetAlertFeature[], en: MetAlertFeature[], activeIds: Set<string>, now: Date): ParsedEvent[] {
  const enById = new Map(en.map((f) => [f.properties.id, f]));
  return no.filter(isActual).map((f) => normalizeMetAlert(f, enById.get(f.properties.id), activeIds.has(f.properties.id), now));
}

// ---------------------------------------------------------------- NVE

interface NveState {
  hashes: Record<string, string>;
}

/** Flood and landslide warnings (nb + en). A warning withdrawn before it expires is ended. */
export async function runNveJob(now = new Date()): Promise<RunStats> {
  const state = await readState<NveState>("nve");
  const parsed: ParsedEvent[] = [];
  for (const hazard of ["flom", "jordskred"] as Hazard[]) {
    const no = await fetchNveWarnings(hazard, 1, now);
    await sleep(1_000);
    const en = await fetchNveWarnings(hazard, 2, now);
    const enById = new Map(en.map((w) => [w.Id, w]));
    parsed.push(...no.map((w) => normalizeNve(hazard, w, enById.get(w.Id), now)));
    await sleep(1_000);
  }
  const result = await upsertEvents(parsed, state.hashes ?? {});
  const goneIds = Object.keys(state.hashes ?? {}).filter((id) => !(id in result.hashes));
  const ended = await markEnded(goneIds, now);
  await writeState("nve", { hashes: result.hashes });
  return { fetched: parsed.length, written: result.written, unchanged: result.unchanged, ended, mode: "live" };
}

// ---------------------------------------------------------------- Nødvarsel

interface NodvarselState {
  hashes: Record<string, string>;
  activeIds: string[];
  pastCheckedAt: string;
}

/**
 * Active alerts every run. The list of past alerts (history, final state of ended
 * alerts) on the first run, when an active alert disappears, and otherwise hourly.
 */
export async function runNodvarselJob(now = new Date()): Promise<RunStats> {
  const state = await readState<NodvarselState>("nodvarsel");
  const active = (await fetchNodvarsel("active")).filter((i) => !isTestAlert(i)).map((i) => normalizeNodvarsel(i, true, now));
  const activeIds = active.map((p) => p.event.id);
  const gone = (state.activeIds ?? []).filter((id) => !activeIds.includes(id));

  const parsed = [...active];
  let pastCheckedAt = state.pastCheckedAt ?? "";
  if (!pastCheckedAt || gone.length || now.getTime() - new Date(pastCheckedAt).getTime() >= 60 * MINUTE) {
    await sleep(1_000);
    const past = (await fetchNodvarsel("past")).filter((i) => !isTestAlert(i)).map((i) => normalizeNodvarsel(i, false, now));
    parsed.push(...past.filter((p) => !activeIds.includes(p.event.id)));
    pastCheckedAt = now.toISOString();
  }
  const result = await upsertEvents(parsed, state.hashes ?? {});
  // Gone from the active list but not (yet) in the past list.
  const ended = await markEnded(gone.filter((id) => !parsed.some((p) => p.event.id === id)), now);
  await writeState("nodvarsel", { hashes: result.hashes, activeIds, pastCheckedAt });
  return { fetched: parsed.length, written: result.written, unchanged: result.unchanged, ended, mode: "live" };
}

// ---------------------------------------------------------------- News (NRK)

interface NewsState {
  hashes: Record<string, string>;
}

export async function runNrkJob(now = new Date()): Promise<RunStats> {
  const state = await readState<NewsState>("nrk");
  const feeds = await fetchNrk();
  const items = feeds.reduce((n, f) => n + f.items.length, 0);
  const parsed = feeds.flatMap(({ feed, items: list }) =>
    list.map((i) => normalizeNrk(i, feed.fylker, now)).filter((p): p is ParsedEvent => p !== null),
  );
  const result = await upsertEvents(dedupe(parsed), state.hashes ?? {});
  await writeState("nrk", { hashes: result.hashes });
  return { fetched: items, written: result.written, unchanged: result.unchanged, mode: `${parsed.length} relevante` };
}

/** The same NRK article can appear in two district feeds. */
function dedupe(parsed: ParsedEvent[]): ParsedEvent[] {
  return [...new Map(parsed.map((p) => [p.event.id, p])).values()];
}

// ---------------------------------------------------------------- Maintenance

/** Events whose end time has passed but were never explicitly closed. */
export async function closeExpiredEvents(now = new Date()): Promise<number> {
  const snap = await firestore()
    .collection(EVENTS)
    .where("status", "==", "aktiv")
    .where("endTime", "<", now)
    .select()
    .limit(2000)
    .get();
  return markEnded(
    snap.docs.map((d) => d.id),
    now,
  );
}
