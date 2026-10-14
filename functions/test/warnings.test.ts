import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import metNo from "./fixtures/metalerts-current-no.json";
import metEn from "./fixtures/metalerts-current-en.json";
import nveNo from "./fixtures/nve-jordskred-1.json";
import nveEn from "./fixtures/nve-jordskred-2.json";
import { awarenessColor, MetAlertFeature, normalizeMetAlert } from "../src/sources/metalerts";
import { isWarning, normalizeNve, NveWarning } from "../src/sources/nve";
import { alertSlug, isTestAlert, normalizeNodvarsel } from "../src/sources/nodvarsel";
import { parseRss } from "../src/lib/rss";

const now = new Date("2026-10-14T09:00:00Z");

describe("MetAlerts", () => {
  const no = metNo.features as unknown as MetAlertFeature[];
  const en = metEn.features as unknown as MetAlertFeature[];

  it("normalizes a land alert with kommune list and English text", () => {
    const f = no[0];
    const e = normalizeMetAlert(f, en.find((x) => x.properties.id === f.properties.id), true, now).event;
    expect(e.id).toBe(`metalerts-${f.properties.id}`);
    expect(e.category).toBe("farevarsel");
    expect(e.kind).toBe("varsel");
    expect(["yellow", "orange", "red"]).toContain(e.severity);
    expect(e.kommuner.length).toBe(new Set(f.properties.municipality).size);
    expect(e.fylker).toEqual([...new Set(f.properties.county)].sort());
    expect(e.geoPrecision).toBe("omrade");
    expect(e.title).toBe(`${f.properties.eventAwarenessName} – ${f.properties.area}`);
    expect(e.en?.title).toMatch(/ – /u);
    expect(e.status).toBe("aktiv");
  });

  it("is ended when it is no longer in the current list", () => {
    expect(normalizeMetAlert(no[0], undefined, false, now).event.status).toBe("avsluttet");
  });

  it("reads the colour from the awareness level", () => {
    expect(awarenessColor({ id: "x", awareness_level: "3; orange; Severe" })).toBe("orange");
    expect(awarenessColor({ id: "x", riskMatrixColor: "Red" })).toBe("red");
  });
});

describe("NVE", () => {
  const no = (nveNo as unknown as NveWarning[]).filter(isWarning);
  const en = nveEn as unknown as NveWarning[];

  it("keys warnings on MasterId so a new version replaces the old one", () => {
    const w = no[0];
    const e = normalizeNve("jordskred", w, en.find((x) => x.Id === w.Id), now).event;
    expect(e.id).toBe(`nve-jordskred-${w.MasterId}`);
    expect(e.groupId).toBe(w.Id);
    expect(e.severity).toBe("yellow");
    expect(e.title).toBe(w.MainText);
    expect(e.en?.title).toMatch(/warning/iu);
    expect(e.kommuner.length).toBeGreaterThan(0);
  });

  it("reads local times without an offset as Norwegian time", () => {
    const e = normalizeNve("flom", { Id: "1", MasterId: "1", ActivityLevel: "3", ValidFrom: "2026-10-15T07:00:00", ValidTo: "2026-10-16T06:59:00" }, undefined, now).event;
    expect(e.startTime.toISOString()).toBe("2026-10-15T05:00:00.000Z");
    expect(e.severity).toBe("orange");
    expect(e.status).toBe("aktiv");
  });

  it("drops placeholder (green) rows", () => {
    expect(isWarning({ Id: "xxx", ActivityLevel: "1" })).toBe(false);
    expect(isWarning({ Id: "12", ActivityLevel: "1" })).toBe(false);
    expect(isWarning({ Id: "12", ActivityLevel: "2" })).toBe(true);
  });
});

describe("Nødvarsel", () => {
  const items = parseRss(readFileSync(join(__dirname, "fixtures", "nodvarsel-past.xml"), "utf8"));

  it("parses the feed and filters test alerts", () => {
    expect(items.length).toBeGreaterThan(5);
    expect(isTestAlert({ ...items[0], title: "TEST av Nødvarsel" })).toBe(true);
    expect(isTestAlert({ ...items[0], title: "Nasjonal varslingsprøve" })).toBe(true);
    expect(isTestAlert({ ...items[0], title: "Brann, Sortland", link: "https://www.nodvarsel.no/tidligere-varsler/brann-sortland/" })).toBe(false);
  });

  it("takes the kommune from the title when it names one", () => {
    const item = { ...items[0], title: "Brann, Sortland", link: "https://www.nodvarsel.no/tidligere-varsler/brann-sortland/", guid: "https://www.nodvarsel.no/tidligere-varsler/brann-sortland/" };
    const e = normalizeNodvarsel(item, false, now).event;
    expect(e.id).toBe("nodvarsel-brann-sortland");
    expect(e.kommuneNr).toBe("1870");
    expect(e.category).toBe("nodvarsel");
    expect(e.status).toBe("avsluttet");
    expect(e.sourceUrl).toBe("https://www.nodvarsel.no/tidligere-varsler/brann-sortland/");
  });

  it("has no location when the title names none", () => {
    const e = normalizeNodvarsel({ ...items[0], title: "EKSPLOSJONSFARE" }, true, now).event;
    expect(e.kommuneNr).toBeNull();
    expect(e.geoPrecision).toBe("mangler");
    expect(e.status).toBe("aktiv");
    expect(alertSlug({ ...items[0], guid: null, link: "https://www.nodvarsel.no/tidligere-varsler/eksplosjonsfare3/" })).toBe("eksplosjonsfare3");
  });
});
