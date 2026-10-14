import { describe, expect, it } from "vitest";
import fixture from "./fixtures/politiloggen-threads.json";
import { categorizePolitiloggen, MessageThread, normalizeThreads, threadsUrl, threadUrl } from "../src/sources/politiloggen";

const threads = fixture.messageThreads as MessageThread[];
const { parsed, removedIds } = normalizeThreads(threads);
const byId = (id: string) => parsed.find((p) => p.event.sourceId === id)!.event;

describe("Politiloggen normalization", () => {
  it("makes one event per thread, oldest message as summary and newest as latest update", () => {
    const e = byId("26z04h");
    expect(e.id).toBe("politiloggen-26z04h");
    expect(e.category).toBe("brann");
    expect(e.title).toBe("Brann: Sogndal, Kaupanger");
    expect(e.summary).toBe("Melding om brann i en stolpetrafo.");
    expect(e.latest).toBe("Nødetatene er på stedet. Ingen fare for spredning.");
    expect(e.status).toBe("aktiv");
    expect(e.kommuneNr).toBe("4640");
    expect(e.fylkeNr).toBe("46");
    expect(e.place).toBe("Kaupanger");
    expect(e.geoPrecision).toBe("kommune");
    expect(e.startTime.toISOString()).toBe("2026-10-14T07:59:38.093Z");
    expect(e.updatedAtSource?.toISOString()).toBe("2026-10-14T08:24:10.002Z");
  });

  it("splits Trafikk into accidents, enforcement (shown as crime) and disruptions", () => {
    expect(byId("26z0aa").category).toBe("trafikkulykke");
    expect(byId("26z0bb").category).toBe("kriminalitet");
    expect(byId("26z0bb").subtype).toBe("Trafikkontroll");
    expect(byId("26z0cc").category).toBe("trafikk");
    expect(byId("26z0cc").subtype).toBe("Trafikk");
  });

  it("tells same-named kommuner apart by police district", () => {
    expect(byId("26z0aa").kommuneNr).toBe("3114"); // Våler, Øst
    expect(byId("26z0bb").kommuneNr).toBe("3419"); // Våler, Innlandet
    expect(byId("26z0cc").kommuneNr).toBe("1515"); // Herøy, Møre og Romsdal
    expect(byId("26z0ee").kommuneNr).toBe("4622"); // "Kvam Herad"
  });

  it("does not invent a location for district-wide threads", () => {
    const e = byId("26z0ff");
    expect(e.kommuneNr).toBeNull();
    expect(e.geo).toBeNull();
    expect(e.geoPrecision).toBe("mangler");
    expect(e.category).toBe("redning");
  });

  it("shows crime categories (decision 2026-10-14)", () => {
    expect(byId("26z0dd").category).toBe("kriminalitet");
  });

  it("withdraws threads whose every message was removed, and never stores removed text", () => {
    expect(removedIds).toEqual(["politiloggen-26z0gg"]);
    expect(parsed.some((p) => p.event.sourceId === "26z0gg")).toBe(false);
    expect(JSON.stringify(parsed.map((p) => p.raw))).not.toContain("Removed");
  });

  it("keeps edited messages (current text)", () => {
    expect(byId("26z0aa").latest).toBe("Bilberger er på stedet. Vi avslutter her.");
  });
});

describe("Politiloggen categories", () => {
  it.each([
    ["Brann", "", "brann"],
    ["Redning", "", "redning"],
    ["Sjø", "", "redning"],
    ["Ulykke", "Motorsykkel har kjørt av veien", "trafikkulykke"],
    ["Ulykke", "Person falt fra stige", "redning"],
    ["Trafikk", "Trafikkuhell, kun materielle skader", "trafikkulykke"],
    ["Trafikk", "Sammenstøt mellom to biler", "trafikkulykke"],
    ["Trafikk", "Vogntog har kjørt seg fast, veien er stengt", "trafikk"],
    ["Trafikk", "Fartskontroll, to førerkort beslaglagt", "kriminalitet"],
    ["Tyveri", "", "kriminalitet"],
    ["Vær", "Jordras over veien, ett kjørefelt stengt", "trafikk"],
    ["Dyr", "Hest på jordet", "annet"],
    ["Andre hendelser", "", "annet"],
  ])("%s / %s → %s", (category, text, expected) => {
    expect(categorizePolitiloggen(category, text)).toBe(expected);
  });
});

describe("Politiloggen URLs", () => {
  it("builds the thread query, newest messages first", () => {
    const url = new URL(threadsUrl({ take: 200, skip: 400 }));
    expect(url.pathname).toBe("/messagethreads");
    expect(url.searchParams.get("SortByEnum")).toBe("LastMessageOn");
    expect(url.searchParams.get("SortByAsc")).toBe("false");
    expect(url.searchParams.get("Take")).toBe("200");
    expect(url.searchParams.get("Skip")).toBe("400");
    const day = new URL(threadsUrl({ from: new Date("2026-10-12T22:00:00Z"), to: new Date("2026-10-13T22:00:00Z") }));
    expect(day.searchParams.get("TimeSpanType")).toBe("Custom");
    expect(day.searchParams.get("DateTimeFrom")).toBe("2026-10-12T22:00:00.000Z");
  });

  it("links to the thread page the way politiet.no does", () => {
    expect(threadUrl(threads[0])).toBe("https://www.politiet.no/politiloggen/hendelse/26z04h/vest-politidistrikt-brann-sogndal-kaupanger");
    expect(threadUrl(threads[3])).toBe(
      "https://www.politiet.no/politiloggen/hendelse/26z0cc/more-og-romsdal-politidistrikt-trafikk-heroy-fosnavag",
    );
  });
});
