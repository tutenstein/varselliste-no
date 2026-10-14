import { describe, expect, it } from "vitest";
import { encodeGeohash } from "../src/lib/geohash";
import { centreOfKommuner, findFylke, findKommune, findKommuneInText, fylkerForDistrict, kommuneByNr } from "../src/lib/regions";
import { backfillDays, osloDate, osloDayRange, parseOsloTime } from "../src/lib/time";
import { decodeXml, parseRss } from "../src/lib/rss";
import { FYLKER, KOMMUNER } from "../src/data/regions";
import { KOMMUNE_GEO } from "../src/data/kommuneGeo";

describe("region data", () => {
  it("has the 2024 structure: 15 fylker, 357 kommuner, a centre point for each", () => {
    expect(Object.keys(FYLKER)).toHaveLength(15);
    expect(Object.keys(KOMMUNER)).toHaveLength(357);
    expect(Object.keys(KOMMUNE_GEO)).toHaveLength(357);
    for (const [lat, lng] of Object.values(KOMMUNE_GEO)) {
      expect(lat).toBeGreaterThan(57);
      expect(lat).toBeLessThan(72);
      expect(lng).toBeGreaterThan(4);
      expect(lng).toBeLessThan(32);
    }
  });

  it("has unique slugs; Herøy and Våler are told apart by fylke", () => {
    const slugs = Object.values(KOMMUNER).map((k) => k.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(KOMMUNER["1515"].slug).toBe("heroy-more-og-romsdal");
    expect(KOMMUNER["1818"].slug).toBe("heroy-nordland");
    expect(KOMMUNER["3114"].slug).toBe("valer-ostfold");
    expect(KOMMUNER["3419"].slug).toBe("valer-innlandet");
    expect(KOMMUNER["5001"].slug).toBe("trondheim");
    expect(KOMMUNER["0301"].slug).toBe("oslo");
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/u);
  });
});

describe("regions", () => {
  it("finds kommuner by Norwegian or other official name, case-insensitively", () => {
    expect(findKommune("Bergen")?.nr).toBe("4601");
    expect(findKommune("bergen kommune")?.fylkeNr).toBe("46");
    expect(findKommune("Kvam Herad")?.nr).toBe("4622");
    expect(findKommune("Guovdageaidnu")?.nr).toBe("5612"); // Kautokeino
    expect(findKommune("Aurskog Høland")?.nr).toBe("3226");
    expect(findKommune("Våler (Østfold)")).toBeNull(); // ambiguous without a hint
    expect(findKommune("Atlantis")).toBeNull();
  });

  it("uses the police district to tell Herøy and Våler apart", () => {
    expect(findKommune("Herøy", fylkerForDistrict("Møre og Romsdal Politidistrikt"))?.nr).toBe("1515");
    expect(findKommune("Herøy", fylkerForDistrict("Nordland Politidistrikt"))?.nr).toBe("1818");
    expect(findKommune("Våler", fylkerForDistrict("Øst Politidistrikt"))?.nr).toBe("3114");
    expect(findKommune("Våler", fylkerForDistrict("Innlandet Politidistrikt"))?.nr).toBe("3419");
    expect(findKommune("Herøy")).toBeNull();
  });

  it("finds fylker by name or number", () => {
    expect(findFylke("Vestland")?.nr).toBe("46");
    expect(findFylke(3)?.navn).toBe("Oslo");
    expect(findFylke("Møre og Romsdal")?.nr).toBe("15");
    expect(findFylke("99")).toBeNull();
  });

  it("finds kommune names in running text as whole, capitalised words", () => {
    expect(findKommuneInText("Trafikkulykke i Halden")?.nr).toBe("3101");
    expect(findKommuneInText("Brann i boligblokk i Drammen sentrum")?.nr).toBe("3301");
    expect(findKommuneInText("Kø i en time på E18")).toBeNull(); // "time" ≠ Time kommune
    expect(findKommuneInText("Ulykke i Nordre Follo")?.nr).toBe("3207");
    expect(findKommuneInText("Ulykke i Herøy")).toBeNull();
    expect(findKommuneInText("Ulykke i Herøy", ["18"])?.nr).toBe("1818");
  });

  it("averages kommune centres for area warnings", () => {
    const c = centreOfKommuner(["4601", "4602"])!;
    expect(c.lat).toBeGreaterThan(60);
    expect(c.lat).toBeLessThan(62);
    expect(centreOfKommuner([])).toBeNull();
    expect(kommuneByNr("9999")).toBeNull();
  });
});

describe("time (Europe/Oslo)", () => {
  it("formats Norwegian dates", () => {
    expect(osloDate(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
  });

  it("parses local times without an offset, across DST", () => {
    expect(parseOsloTime("2026-10-15T07:00:00")?.toISOString()).toBe("2026-10-15T05:00:00.000Z"); // CEST
    expect(parseOsloTime("2026-11-15T07:00:00")?.toISOString()).toBe("2026-11-15T06:00:00.000Z"); // CET
    expect(parseOsloTime("2026-10-14T09:49:53+02:00")?.toISOString()).toBe("2026-10-14T07:49:53.000Z");
    expect(parseOsloTime("nonsense")).toBeNull();
    expect(parseOsloTime(null)).toBeNull();
  });

  it("lists backfill days and day ranges", () => {
    expect(backfillDays(new Date("2026-10-13T22:30:00Z"), 3)).toEqual(["2026-10-13", "2026-10-12", "2026-10-11"]);
    const [from, to] = osloDayRange("2026-10-25"); // DST ends: a 25-hour day
    expect(from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("geohash", () => {
  it("encodes a known point", () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });
});

describe("rss", () => {
  it("decodes entities and CDATA", () => {
    expect(decodeXml("<![CDATA[Brann & røyk]]>")).toBe("Brann & røyk");
    expect(decodeXml("Tr&#248;ndelag &amp; Nordland &#x2013; &quot;x&quot;")).toBe('Trøndelag & Nordland – "x"');
  });

  it("parses items", () => {
    const items = parseRss(
      `<rss><channel><item><title>A &amp; B</title><link>https://x/1</link><guid isPermaLink="false">1.2</guid><category>C</category><pubDate>Wed, 14 Oct 2026 08:01:34 GMT</pubDate></item></channel></rss>`,
    );
    expect(items).toEqual([
      { title: "A & B", link: "https://x/1", guid: "1.2", pubDate: "Wed, 14 Oct 2026 08:01:34 GMT", updated: null, categories: ["C"], description: null },
    ]);
  });
});
