import { describe, expect, it } from "vitest";
import { distanceKm, inFylke, inKommune, matchesQuery, matchesScope, mergeShards, normalizeText, type FeedEvent, type Filters } from "../src/lib/feed";
import { alternatePath, typeLabel, severityLabel, detailText } from "../src/i18n";
import { KOMMUNE_LIST, FYLKE_LIST } from "../src/lib/regions";

const now = Date.UTC(2026, 9, 14, 12);
const ev = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: "x",
  s: "vegvesen",
  c: "trafikkulykke",
  t: "Accident/accident",
  ti: "Fv. 17 Grønvollen i Brønnøy, Nordland",
  su: "Trafikkulykke.",
  st: now - 3600_000,
  en: null,
  up: null,
  x: "aktiv",
  sv: "high",
  k: "1813",
  f: "18",
  r: "Fv17",
  g: [65.47, 12.21],
  gp: "eksakt",
  u: null,
  ...over,
});
const filters = (over: Partial<Filters> = {}): Filters => ({
  range: "24h",
  categories: new Set(),
  fylke: null,
  kommune: null,
  q: "",
  near: null,
  ...over,
});
const text = (e: FeedEvent) => [e.t, e.ti, e.su, e.r].filter(Boolean).join(" ");

describe("search", () => {
  it("matches road numbers as whole tokens, in every Norwegian spelling", () => {
    expect(matchesQuery("E6", "Kø på E6 ved Gardermoen")).toBe(true);
    expect(matchesQuery("E6", "Ulykke på E69 mot Nordkapp")).toBe(false);
    expect(matchesQuery("fv17", "Fv. 17 Grønvollen i Brønnøy")).toBe(true);
    expect(matchesQuery("fv 17", "Fv17")).toBe(true);
    expect(matchesQuery("rv7", "Rv. 7 Hardangervidda stengt")).toBe(true);
    expect(matchesQuery("R7", "Rv7")).toBe(true);
    expect(matchesQuery("17", "Fv. 175")).toBe(false);
  });

  it("matches words as substrings, ignoring case, æ/ø/å and diacritics", () => {
    expect(matchesQuery("tromso brann", "Brann i Tromsø sentrum")).toBe(true);
    expect(matchesQuery("Tromsø", "brann i tromso")).toBe(true);
    expect(matchesQuery("baerum", "Ulykke i Bærum")).toBe(true);
    expect(matchesQuery("redning", "Brann i Tromsø")).toBe(false);
    expect(normalizeText("Fv. 1504 Kurlandsbekken")).toBe("fv1504 kurlandsbekken");
  });
});

describe("scope", () => {
  it("applies time range, county, municipality and distance", () => {
    expect(matchesScope(ev(), filters(), now, text)).toBe(true);
    expect(matchesScope(ev({ st: now - 2 * 86400_000 }), filters(), now, text)).toBe(false);
    expect(matchesScope(ev({ st: now - 2 * 86400_000 }), filters({ range: "7d" }), now, text)).toBe(true);
    expect(matchesScope(ev(), filters({ fylke: "46" }), now, text)).toBe(false);
    expect(matchesScope(ev(), filters({ kommune: "1813" }), now, text)).toBe(true);
    expect(matchesScope(ev(), filters({ near: { lat: 65.5, lng: 12.3, km: 25 } }), now, text)).toBe(true);
    expect(matchesScope(ev(), filters({ near: { lat: 59.91, lng: 10.75, km: 100 } }), now, text)).toBe(false);
  });

  it("never treats county-level or unknown positions as near", () => {
    expect(matchesScope(ev({ gp: "fylke" }), filters({ near: { lat: 65.47, lng: 12.21, km: 100 } }), now, text)).toBe(false);
    expect(matchesScope(ev({ gp: "mangler" }), filters({ near: { lat: 65.47, lng: 12.21, km: 100 } }), now, text)).toBe(false);
  });

  it("shows area warnings on every kommune and fylke page they cover, regardless of age", () => {
    const w = ev({ s: "metalerts", c: "farevarsel", k: null, f: null, ks: ["4601", "4602"], fs: ["46"], st: now - 40 * 86400_000 });
    expect(inKommune(w, "4601")).toBe(true);
    expect(inKommune(w, "1813")).toBe(false);
    expect(inFylke(w, "46")).toBe(true);
    expect(matchesScope(w, filters({ kommune: "4602" }), now, text)).toBe(true);
    expect(matchesScope({ ...w, x: "avsluttet" }, filters({ kommune: "4602" }), now, text)).toBe(false);
  });

  it("does not put a point incident on another kommune's page", () => {
    expect(inKommune(ev(), "1804")).toBe(false);
  });
});

describe("labels", () => {
  it("labels Vegvesen codes in both languages (no translation of the source text)", () => {
    expect(typeLabel("nb", ev())).toBe("Trafikkulykke");
    expect(typeLabel("en", ev())).toBe("Traffic accident");
    expect(typeLabel("en", ev({ t: "VehicleObstruction/brokenDownVehicle", c: "trafikk" }))).toBe("Stopped vehicle");
    expect(typeLabel("nb", ev({ t: "TransitInformation/ferry", c: "trafikk" }))).toBe("Ferje innstilt");
    expect(severityLabel("en", ev({ sv: "highest" }))).toBe("Severe impact");
    expect(severityLabel("nb", ev({ sv: "low" }))).toBeNull();
    expect(detailText("en", ev())).toBe("Fv. 17 Grønvollen i Brønnøy, Nordland. Trafikkulykke.");
  });

  it("labels police threads", () => {
    const p = (t: string, c: FeedEvent["c"]) => ev({ s: "politiloggen", t, c });
    expect(typeLabel("nb", p("Brann", "brann"))).toBe("Brann");
    expect(typeLabel("en", p("Ro og orden", "kriminalitet"))).toBe("Public order");
    expect(typeLabel("nb", p("Trafikk", "trafikkulykke"))).toBe("Trafikkulykke");
    expect(typeLabel("en", p("Trafikkontroll", "kriminalitet"))).toBe("Traffic enforcement");
  });

  it("uses English warning text when MET/NVE publish one", () => {
    const w = ev({ s: "metalerts", c: "farevarsel", ti: "Mye regn – Deler av Vestland", e: { ti: "Heavy rain – Parts of Vestland", su: "Rain." }, sv: "yellow" });
    expect(typeLabel("en", w)).toBe("Heavy rain – Parts of Vestland");
    expect(typeLabel("nb", w)).toBe("Mye regn – Deler av Vestland");
    expect(severityLabel("nb", w)).toBe("Gult nivå");
  });
});

describe("helpers", () => {
  it("computes distances", () => {
    const d = distanceKm([59.9139, 10.7522], [60.3913, 5.3221]); // Oslo–Bergen ≈ 305 km
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(310);
  });

  it("merges shards newest first without duplicates", () => {
    const merged = mergeShards([
      { events: [ev({ id: "a", st: 1 }), ev({ id: "b", st: 3 })], generatedAt: null, sources: null },
      { events: [ev({ id: "a", st: 1 }), ev({ id: "c", st: 2 })], generatedAt: null, sources: null },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("maps pages between languages", () => {
    expect(alternatePath("/kommune/baerum/", "en")).toBe("/en/municipality/baerum/");
    expect(alternatePath("/en/county/more-og-romsdal/", "nb")).toBe("/fylke/more-og-romsdal/");
    expect(alternatePath("/om/", "en")).toBe("/en/about/");
    expect(alternatePath("/en/municipalities/", "nb")).toBe("/kommuner/");
    expect(alternatePath("/", "en")).toBe("/en/");
  });

  it("gives every kommune a unique slug; Herøy and Våler carry the fylke", () => {
    expect(KOMMUNE_LIST).toHaveLength(357);
    expect(FYLKE_LIST).toHaveLength(15);
    expect(new Set(KOMMUNE_LIST.map((k) => k.slug)).size).toBe(KOMMUNE_LIST.length);
    expect(KOMMUNE_LIST.filter((k) => k.name === "Herøy").map((k) => k.slug).sort()).toEqual(["heroy-more-og-romsdal", "heroy-nordland"]);
    expect(KOMMUNE_LIST.filter((k) => k.name === "Våler").map((k) => k.slug).sort()).toEqual(["valer-innlandet", "valer-ostfold"]);
    expect(KOMMUNE_LIST.find((k) => k.code === "3201")?.slug).toBe("baerum");
  });
});
