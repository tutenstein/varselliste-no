import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRss } from "../src/lib/rss";
import { classifyHeadline, newsItemId, normalizeNews, NRK_FEEDS } from "../src/sources/news";

const read = (f: string) => parseRss(readFileSync(join(__dirname, "fixtures", f), "utf8"));
const now = new Date("2026-10-14T09:00:00Z");

describe("headline classification", () => {
  it.each([
    ["Brann i stolpetrafo i Kaupanger", "brann"],
    ["Ingen skadde i skipsbrann", "brann"],
    ["Kraftig røykutvikling fra næringsbygg", "brann"],
    ["Trafikkulukke i Vestby", "trafikkulykke"],
    ["Utforkøyring i Ålesund", "trafikkulykke"],
    ["Tre biler i ulykke", "trafikkulykke"],
    ["Elg påkjørt av rutebuss i Gjerdrum – avlivet", "trafikkulykke"],
    ["Startet leteaksjon i Froland – funnet i god behold", "redning"],
    ["Arbeidsulykke i Sarpsborg: Person satt fastklemt", "redning"],
    ["Tankbåt under slep", "redning"],
    ["Fjellovergang stengd på grunn av bilberging", "trafikk"],
    ["Hurtigbåten mellom Trondheim-Brekstad innstilt", "trafikk"],
    ["Bil i motsett køyrefelt på Danmarksplass", "trafikk"],
    ["Gult farevarsel for styrtregn", "farevarsel"],
  ])("%s → %s", (title, expected) => {
    expect(classifyHeadline(title)).toBe(expected);
  });

  it.each([
    "Brann får 16 millioner til likestillingsløft", // SK Brann
    "Brann – Rosenborg 2–1",
    "Gihlemoen innstilt på topp: Vil egentlig legge ned fylkeskommunen",
    "Gondolplaner på Skørsnøse i Valdres får kritikk fra Statsforvalteren",
    "Køyrde 79 m/t i 50-sone",
    "Mistenkt for ruskøyring i Ålesund",
    "Advokat ranet og sperret inne på badet",
    "Politiet sperrar av område i Kalvåg",
    "Fire personar tiltalt for omfattande narkotikaverksemd i Bergen",
    "Rana kommune får ny ordfører",
    "Nordic Mining raste på børsen etter opning",
  ])("not an incident: %s", (title) => {
    expect(classifyHeadline(title)).toBeNull();
  });
});

describe("NRK", () => {
  const items = read("nrk-vestland.xml");
  const vestland = NRK_FEEDS.find((f) => f.district === "vestland")!;
  const parsed = items.map((i) => normalizeNews("nrk", i, vestland.fylker, now)).filter((p) => p !== null);

  it("keeps only incident headlines, unchanged, with link and time", () => {
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.length).toBeLessThan(items.length);
    const fire = parsed.find((p) => p.event.title === "Brann i stolpetrafo i Kaupanger")!.event;
    expect(fire.id).toBe("nrk-1.18054427");
    expect(fire.kind).toBe("nyhet");
    expect(fire.category).toBe("brann");
    expect(fire.sourceUrl).toMatch(/^https:\/\/www\.nrk\.no\/vestland\//u);
    expect(fire.attribution).toBe("Nyheter fra NRK");
    expect(fire.summary).toBeNull(); // the description is never stored
    expect(fire.fylkeNr).toBe("46");
    expect(fire.geoPrecision).toBe("fylke");
  });

  it("stores only title, link, guid and time as raw payload", () => {
    for (const p of parsed) expect(Object.keys(p.raw as object).sort()).toEqual(["guid", "link", "time", "title"]);
  });

  it("covers every fylke with a district feed", () => {
    const covered = new Set(NRK_FEEDS.flatMap((f) => f.fylker));
    expect(covered.size).toBe(15);
  });
});

describe("Hovedredningssentralen", () => {
  const items = read("hrs-feed.xml");

  it("keeps rescue operations, not organisational news", () => {
    const kept = items.map((i) => normalizeNews("hrs", i, null, now)).filter((p) => p !== null);
    expect(kept.map((p) => p.event.title)).toEqual(["Redningsaksjon ved Narvik Havn"]);
    expect(kept[0].event.kommuneNr).toBe("1806");
    expect(kept[0].event.category).toBe("redning");
  });

  it("uses the WordPress post id", () => {
    expect(newsItemId({ title: "x", link: "https://www.hovedredningssentralen.no/a/", guid: "https://www.hovedredningssentralen.no/?p=21458", pubDate: null, updated: null, categories: [], description: null })).toBe("p21458");
  });
});
