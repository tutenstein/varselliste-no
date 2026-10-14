import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { FeedEvent, isFeedEligible, partDocId, partition, shardOf, splitBySize, StoredEvent, toFeedEvent } from "../src/feeds";

const now = new Date("2026-10-14T12:00:00Z");
const hoursAgo = (h: number) => Timestamp.fromMillis(now.getTime() - h * 3600_000);

function stored(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    source: "politiloggen",
    sourceId: "26z04h",
    groupId: null,
    sourceUrl: "https://www.politiet.no/politiloggen/hendelse/26z04h/x",
    attribution: "Kilde: Politiet (Politiloggen), NLOD 2.0",
    kind: "hendelse",
    category: "brann",
    subtype: "Brann",
    title: "Brann: Sogndal, Kaupanger",
    summary: "Melding om brann i en stolpetrafo.",
    latest: null,
    startTime: hoursAgo(1),
    endTime: null,
    publishedAt: hoursAgo(1),
    updatedAtSource: hoursAgo(1),
    status: "aktiv",
    severity: null,
    kommuneNr: "4640",
    kommuneNavn: "Sogndal",
    fylkeNr: "46",
    fylkeNavn: "Vestland",
    kommuner: [],
    fylker: [],
    place: "Kaupanger",
    roadNumber: null,
    geo: { lat: 61.2297, lng: 7.0983 },
    geohash: "u4x",
    geoPrecision: "kommune",
    en: null,
    ...overrides,
  };
}

describe("isFeedEligible", () => {
  it("keeps every Politiloggen category, crime included", () => {
    for (const category of ["brann", "redning", "trafikkulykke", "trafikk", "kriminalitet", "annet"] as const) {
      expect(isFeedEligible(stored({ category }), now)).toBe(true);
    }
  });

  it("drops threads withdrawn by the police", () => {
    expect(isFeedEligible(stored({ removed: true }), now)).toBe(false);
  });

  it("keeps Vegvesen incidents but not works, management or planned closures", () => {
    const vv = (subtype: string, severity: string, extra: Partial<StoredEvent> = {}) =>
      stored({ source: "vegvesen", category: "trafikk", subtype, severity, ...extra });
    expect(isFeedEligible(vv("Accident/accident", "unknown", { category: "trafikkulykke" }), now)).toBe(true);
    expect(isFeedEligible(vv("VehicleObstruction/brokenDownVehicle", "low"), now)).toBe(true);
    expect(isFeedEligible(vv("TransitInformation/ferry", "highest"), now)).toBe(true);
    expect(isFeedEligible(vv("TransitInformation/ferry", "high"), now)).toBe(false);
    expect(isFeedEligible(vv("MaintenanceWorks/roadworks", "low", { category: "vegarbeid" }), now)).toBe(false);
    expect(isFeedEligible(vv("RoadOrCarriagewayOrLaneManagement/roadClosed", "highest"), now)).toBe(false);
    expect(isFeedEligible(vv("GeneralNetworkManagement/temporaryTrafficLights", "low"), now)).toBe(false);
  });

  it("drops events older than 30 days and planned future events", () => {
    expect(isFeedEligible(stored({ startTime: hoursAgo(31 * 24) }), now)).toBe(false);
    expect(isFeedEligible(stored({ startTime: hoursAgo(-5) }), now)).toBe(false);
  });

  it("keeps active warnings regardless of age, ended ones for 30 days", () => {
    const warning = stored({ source: "metalerts", kind: "varsel", category: "farevarsel", startTime: hoursAgo(24 * 40) });
    expect(isFeedEligible(warning, now)).toBe(true);
    expect(isFeedEligible({ ...warning, status: "avsluttet" }, now)).toBe(false);
    expect(isFeedEligible({ ...warning, status: "avsluttet", startTime: hoursAgo(24 * 3) }, now)).toBe(true);
  });

  it("keeps news links for a week only", () => {
    const news = stored({ source: "nrk", kind: "nyhet", category: "brann", status: "ukjent" });
    expect(isFeedEligible(news, now)).toBe(true);
    expect(isFeedEligible({ ...news, startTime: hoursAgo(8 * 24) }, now)).toBe(false);
  });
});

describe("toFeedEvent", () => {
  it("produces a compact record with epoch times and rounded coordinates", () => {
    const ev = toFeedEvent("politiloggen-26z04h", stored({ summary: "x".repeat(1000), latest: "Slukket." }));
    expect(ev.st).toBe(now.getTime() - 3600_000);
    expect(ev.g).toEqual([61.2297, 7.0983]);
    expect(ev.su!.length).toBeLessThanOrEqual(280);
    expect(ev.su!.endsWith("…")).toBe(true);
    expect(ev.la).toBe("Slukket.");
    expect(ev.pl).toBe("Kaupanger");
    expect(ev.k).toBe("4640");
    expect(ev.f).toBe("46");
    expect(ev.ks).toBeUndefined();
    expect(ev.e).toBeUndefined();
  });

  it("carries area lists and English text for warnings", () => {
    const ev = toFeedEvent(
      "metalerts-1",
      stored({ category: "farevarsel", kommuner: ["4601", "4602"], fylker: ["46"], place: null, en: { title: "Heavy rain – Parts of Vestland", summary: "Rain." } }),
    );
    expect(ev.ks).toEqual(["4601", "4602"]);
    expect(ev.fs).toEqual(["46"]);
    expect(ev.pl).toBeUndefined();
    expect(ev.e).toEqual({ ti: "Heavy rain – Parts of Vestland", su: "Rain." });
  });
});

describe("partition", () => {
  const ev = (id: string, ageHours: number, extra: Partial<FeedEvent> = {}): FeedEvent => ({
    ...toFeedEvent(id, stored({ startTime: hoursAgo(ageHours) })),
    ...extra,
  });

  it("splits by age into live / week / month and sorts newest first", () => {
    const parts = partition([ev("a", 50), ev("b", 1), ev("c", 3), ev("d", 24 * 10), ev("e", 24 * 40)], now);
    expect(parts.live.map((e) => e.id)).toEqual(["b", "c"]);
    expect(parts.week.map((e) => e.id)).toEqual(["a"]);
    expect(parts.month.map((e) => e.id)).toEqual(["d"]);
  });

  it("puts active warnings and emergency alerts in live even when they started long ago", () => {
    expect(shardOf(ev("w", 24 * 100, { c: "farevarsel", x: "aktiv" }), now)).toBe("live");
    expect(shardOf(ev("n", 24 * 5, { c: "nodvarsel", x: "aktiv" }), now)).toBe("live");
    expect(shardOf(ev("n", 24 * 5, { c: "nodvarsel", x: "avsluttet" }), now)).toBe("week");
  });

  it("splits a large shard into parts below the size limit, keeping order", () => {
    const list = Array.from({ length: 50 }, (_, i) => ev(`e${i}`, i));
    const parts = splitBySize(list, 3_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flat().map((e) => e.id)).toEqual(list.map((e) => e.id));
    for (const p of parts) expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(3_000);
    expect(splitBySize([])).toEqual([[]]);
    expect(partDocId("month", 0)).toBe("month");
    expect(partDocId("month", 2)).toBe("month-3");
  });
});
