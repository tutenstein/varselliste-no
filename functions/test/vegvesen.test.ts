import { describe, expect, it } from "vitest";
import fixture from "./fixtures/vegvesen-records.json";
import {
  categorizeVegvesen,
  isVegvesenIncident,
  kommuneFromLocation,
  normalizeRecord,
  normalizeRoad,
  VegvesenRecord,
} from "../src/sources/vegvesen";

const records = fixture.features.map((f) => f.properties as VegvesenRecord);
const now = new Date("2026-10-14T09:00:00Z");
const events = records.map((r) => normalizeRecord(r, now).event);
const find = (type: string, severity?: string) => events.find((e) => e.subtype.startsWith(type) && (!severity || e.severity === severity))!;

describe("Vegvesen normalization", () => {
  it("normalizes an accident with exact coordinates, road and kommune", () => {
    const e = find("Accident", "high");
    expect(e.id).toMatch(/^vegvesen-[0-9a-f-]+_\d+$/u);
    expect(e.category).toBe("trafikkulykke");
    expect(e.subtype).toBe("Accident/accident");
    expect(e.roadNumber).toBe("Fv17");
    expect(e.kommuneNr).toBe("1813"); // Brønnøy
    expect(e.fylkeNr).toBe("18");
    expect(e.geoPrecision).toBe("eksakt");
    expect(e.geo!.lat).toBeGreaterThan(64);
    expect(e.summary).toBe("Trafikkulykke.");
    expect(e.title).toBe("Fv. 17 Grønvollen i Brønnøy, Nordland");
  });

  it("classifies works and traffic management", () => {
    expect(find("MaintenanceWorks").category).toBe("vegarbeid");
    expect(find("RoadOrCarriagewayOrLaneManagement").category).toBe("trafikk");
    expect(find("VehicleObstruction").category).toBe("trafikk");
    expect(categorizeVegvesen("VehicleObstruction", "vehicleOnFire")).toBe("brann");
  });

  it("lists incidents and cancelled ferries, not works or planned closures", () => {
    expect(isVegvesenIncident("Accident/accident", "unknown")).toBe(true);
    expect(isVegvesenIncident("VehicleObstruction/brokenDownVehicle", "high")).toBe(true);
    expect(isVegvesenIncident("AnimalPresenceObstruction/animalsOnTheRoad", "low")).toBe(true);
    expect(isVegvesenIncident("TransitInformation/ferry", "highest")).toBe(true);
    expect(isVegvesenIncident("TransitInformation/ferry", "high")).toBe(false);
    expect(isVegvesenIncident("MaintenanceWorks/roadworks", "low")).toBe(false);
    expect(isVegvesenIncident("RoadOrCarriagewayOrLaneManagement/roadClosed", "highest")).toBe(false);
    expect(isVegvesenIncident("SpeedManagement/speedRestrictionInOperation", "high")).toBe(false);
  });

  it("marks records past their end time as ended", () => {
    const later = normalizeRecord(records[0], new Date("2030-01-01T00:00:00Z")).event;
    expect(later.status).toBe("avsluttet");
  });
});

describe("kommune from the location text", () => {
  it("reads 'i <kommune>, <fylke>' and validates the pair", () => {
    expect(kommuneFromLocation("E39 (avkjøringsveg) Tøsdalskrysset (rundkjøring) i Bjørnafjorden, Vestland, i retning mot Stord (Leirvik)")?.nr).toBe("4624");
    expect(kommuneFromLocation("Fv. 7280 Nyheim i Herøy, Nordland - fv. 7280 Nyheim i Herøy, Nordland")?.nr).toBe("1818");
    expect(kommuneFromLocation("Fv. 115 Søndre Guttulsrød i Våler, Østfold - fv. 115 Sjønnerød i Våler, Østfold")?.nr).toBe("3114");
    expect(kommuneFromLocation("Fv. 5878 Nerlandsøybrua i Herøy, Møre og Romsdal")?.nr).toBe("1515");
    expect(kommuneFromLocation("Fv. 51 Valdresflye i Vågå/Øystre Slidre/Vang, Innlandet")?.fylkeNr).toBe("34");
    expect(kommuneFromLocation(null)).toBeNull();
  });
});

describe("road numbers", () => {
  it.each([
    ["E6", "E6"],
    ["R7", "Rv7"],
    ["F1504", "Fv1504"],
    ["K12", "Kv12"],
    [" e39 ", "E39"],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeRoad(input)).toBe(expected);
  });
});
