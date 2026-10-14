/**
 * Fetches live data and prints distributions of what would be stored — no Firestore access.
 *   npm run dry-run                       (every source)
 *   npm run dry-run -- politiloggen nve   (some sources)
 * Prints aggregates only: no police message texts (they may contain personal details).
 * One request per source and run (NRK: one per district feed).
 */
import { ParsedEvent } from "../lib/model";
import { fetchThreads, normalizeThreads } from "../sources/politiloggen";
import { fetchRecords, normalizeRecord } from "../sources/vegvesen";
import { fetchMetAlerts, isActual, normalizeMetAlert } from "../sources/metalerts";
import { fetchNveWarnings, Hazard, normalizeNve } from "../sources/nve";
import { fetchNodvarsel, isTestAlert, normalizeNodvarsel } from "../sources/nodvarsel";
import { fetchNrk, fetchRss, HRS_FEED, normalizeNews } from "../sources/news";
import { sleep } from "../lib/http";

function count<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

function summarize(name: string, parsed: ParsedEvent[]) {
  console.log(`\n=== ${name}: ${parsed.length} events`);
  console.log("category:", count(parsed, (p) => p.event.category));
  console.log("status:", count(parsed, (p) => p.event.status));
  console.log("geoPrecision:", count(parsed, (p) => p.event.geoPrecision));
  console.log("without kommune:", parsed.filter((p) => !p.event.kommuneNr).length, "· without fylke:", parsed.filter((p) => !p.event.fylkeNr).length);
}

const STOP = new Set(
  "og i på er til av en et for med som det at har ved den om fra ikke vi seg kl ut opp etter inn mot litt nå blir vært også eller så melding meldt politiet stedet rundt var der skal ingen noen".split(" "),
);
/** Most frequent words in a set of texts — enough to judge a keyword rule without reading messages. */
function topWords(texts: string[], n = 30): string {
  const m = new Map<string, number>();
  for (const t of texts)
    for (const w of new Set(t.toLowerCase().split(/[^\p{L}]+/u)))
      if (w.length > 2 && !STOP.has(w)) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w, c]) => `${w}:${c}`)
    .join(" ");
}

const sources: Record<string, () => Promise<void>> = {
  async politiloggen() {
    const { threads, hasMore } = await fetchThreads({ take: 1000 });
    const { parsed, removedIds } = normalizeThreads(threads);
    summarize("Politiloggen", parsed);
    const times = threads.map((t) => t.lastMessageOn ?? t.createdOn);
    console.log("threads:", threads.length, "hasMore:", hasMore, "fully removed:", removedIds.length);
    console.log("lastMessageOn first/last (sort check):", times[0], "→", times[times.length - 1]);
    console.log("createdOn span:", threads.map((t) => t.createdOn).sort()[0], "→", threads.map((t) => t.createdOn).sort().pop());
    console.log("message types:", count(threads.flatMap((t) => t.messages), (m) => m.type ?? "(none)"));
    console.log("messages per thread:", count(threads, (t) => String(Math.min(t.messages.length, 5))));
    console.log("police category → ours:", count(parsed, (p) => `${p.event.subtype} → ${p.event.category}`));
    console.log("districts:", count(threads, (t) => t.district ?? "(none)"));
    const unmatched = parsed.filter((p) => !p.event.kommuneNr).map((p) => p.event.kommuneNavn ?? "(empty)");
    console.log("municipality names without match:", count(unmatched, (n) => n));
    console.log("with area:", threads.filter((t) => t.area).length);
    const text = (p: ParsedEvent) => [p.event.summary, p.event.latest].filter(Boolean).join(" ");
    const traffic = parsed.filter((p) => p.event.subtype === "Trafikk");
    console.log("\nTrafikk → trafikkulykke, top words:", topWords(traffic.filter((p) => p.event.category === "trafikkulykke").map(text)));
    console.log("\nTrafikk → trafikk (not accident), top words:", topWords(traffic.filter((p) => p.event.category === "trafikk").map(text)));
    for (const sub of ["Andre hendelser", "Ulykke", "Dyr", "Vær"]) {
      const list = parsed.filter((p) => p.event.subtype === sub);
      if (list.length) console.log(`\n${sub} (${list.length}), top words:`, topWords(list.map(text), 20));
    }
  },

  async vegvesen() {
    const records = await fetchRecords();
    const parsed = records.map((r) => normalizeRecord(r));
    summarize("Statens vegvesen", parsed);
    console.log("records:", records.length, "unique RECORD_ID:", new Set(records.map((r) => r.RECORD_ID)).size, "situations:", new Set(records.map((r) => r.SITUATION_ID)).size);
    console.log("main record:", count(records, (r) => String(r.IS_MAIN_RECORD)));
    console.log("type/secondary:", count(parsed, (p) => p.event.subtype));
    console.log("severity:", count(records, (r) => r.SEVERITY ?? "(none)"));
    console.log("probability:", count(records, (r) => r.PROBABILITY ?? "(none)"));
    console.log("with END_TIME:", records.filter((r) => r.END_TIME).length);
    const incidents = parsed.filter((p) => !["vegarbeid"].includes(p.event.category));
    console.log("non-works by type & severity:", count(incidents, (p) => `${p.event.subtype} | ${p.event.severity}`));
    const noKommune = parsed.filter((p) => !p.event.kommuneNr).map((p) => p.event.title);
    console.log("location texts without kommune (sample):", noKommune.slice(0, 8));
    const lastUpdate = records.map((r) => r.LAST_UPDATE_TIME ?? "").sort().pop();
    console.log("newest LAST_UPDATE_TIME:", lastUpdate);
  },

  async metalerts() {
    const no = await fetchMetAlerts("current", "no");
    await sleep(1000);
    const en = await fetchMetAlerts("current", "en");
    const enById = new Map((en.features ?? []).map((f) => [f.properties.id, f]));
    const features = (no.features ?? []).filter(isActual);
    const parsed = features.map((f) => normalizeMetAlert(f, enById.get(f.properties.id), true));
    summarize("MetAlerts (land, current)", parsed);
    console.log("last-modified:", no.lastModified);
    console.log("event/color:", count(parsed, (p) => `${p.event.subtype}/${p.event.severity}`));
    console.log("with English:", parsed.filter((p) => p.event.en).length);
    console.log("kommuner per alert:", parsed.map((p) => p.event.kommuner.length));
    console.log("titles:", parsed.map((p) => `${p.event.title} | ${p.event.en?.title}`));
  },

  async nve() {
    for (const hazard of ["flom", "jordskred"] as Hazard[]) {
      const no = await fetchNveWarnings(hazard, 1);
      await sleep(1000);
      const en = await fetchNveWarnings(hazard, 2);
      const enById = new Map(en.map((w) => [w.Id, w]));
      const parsed = no.map((w) => normalizeNve(hazard, w, enById.get(w.Id)));
      summarize(`NVE ${hazard}`, parsed);
      console.log("Id vs MasterId:", no.map((w) => `${w.Id}/${w.MasterId}`));
      console.log("levels:", count(no, (w) => String(w.ActivityLevel)));
      console.log("titles:", parsed.map((p) => `${p.event.title} [${p.event.startTime.toISOString()} → ${p.event.endTime?.toISOString()}] | ${p.event.en?.title}`));
      await sleep(1000);
    }
  },

  async nodvarsel() {
    const active = await fetchNodvarsel("active");
    await sleep(1000);
    const past = await fetchNodvarsel("past");
    console.log(`\n=== Nødvarsel: ${active.length} active, ${past.length} past, tests: ${[...active, ...past].filter(isTestAlert).length}`);
    const parsed = [...active.filter((i) => !isTestAlert(i)).map((i) => normalizeNodvarsel(i, true)), ...past.filter((i) => !isTestAlert(i)).map((i) => normalizeNodvarsel(i, false))];
    summarize("Nødvarsel", parsed);
    console.log("titles → kommune:", parsed.map((p) => `${p.event.title} → ${p.event.kommuneNavn ?? "-"}`));
  },

  async nrk() {
    const feeds = await fetchNrk();
    const all: ParsedEvent[] = [];
    let items = 0;
    for (const { feed, items: list } of feeds) {
      items += list.length;
      const parsed = list.map((i) => normalizeNews("nrk", i, feed.fylker)).filter((p): p is ParsedEvent => p !== null);
      console.log(`NRK ${feed.district}: ${list.length} items, ${parsed.length} incident-related`);
      all.push(...parsed);
    }
    summarize(`NRK (of ${items} items)`, all);
    console.log("kept headlines:", all.map((p) => `[${p.event.category}] ${p.event.title} → ${p.event.kommuneNavn ?? p.event.fylkeNavn ?? "-"}`));
  },

  async hrs() {
    const list = await fetchRss(HRS_FEED);
    const parsed = list.map((i) => normalizeNews("hrs", i, null)).filter((p): p is ParsedEvent => p !== null);
    summarize("Hovedredningssentralen", parsed);
    console.log("headlines:", parsed.map((p) => `${p.event.startTime.toISOString().slice(0, 10)} ${p.event.title} → ${p.event.kommuneNavn ?? "-"} (${p.event.sourceId})`));
  },
};

async function main() {
  const wanted = process.argv.slice(2);
  for (const [name, run] of Object.entries(sources)) {
    if (wanted.length && !wanted.includes(name)) continue;
    try {
      await run();
    } catch (err) {
      console.error(`\n!!! ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
