import { fetchJson } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { eventId, ParsedEvent } from "../lib/model";
import { centreOfKommuner, findFylke, kommuneByNr } from "../lib/regions";
import { osloDate, parseOsloTime } from "../lib/time";

/**
 * NVE / Varsom flood and landslide warnings: https://api.nve.no/doc/
 * Licence NLOD. Required credit: "Varsler fra Flomvarslingen i Norge og www.varsom.no"
 * (and the same for Jordskredvarslingen). Times without an offset are Norwegian local time.
 * Warnings are issued daily (more often during events); level 1 (green) is not a warning.
 */
export type Hazard = "flom" | "jordskred";

const API: Record<Hazard, string> = {
  flom: "https://api01.nve.no/hydrology/forecast/flood/v1.0.10/api",
  jordskred: "https://api01.nve.no/hydrology/forecast/landslide/v1.0.10/api",
};
export const NVE_ATTRIBUTION =
  "Kilde: Varsler fra Flomvarslingen og Jordskredvarslingen i Norge og www.varsom.no (NVE), NLOD";
export const NVE_PAGE: Record<Hazard, string> = {
  flom: "https://www.varsom.no/flom-og-jordskred/varsling/",
  jordskred: "https://www.varsom.no/flom-og-jordskred/varsling/",
};

export interface NveWarning {
  Id: string;
  MasterId?: string | null;
  Version?: number | null;
  LangKey?: number;
  CountyList?: { Id: string; Name?: string }[] | null;
  MunicipalityList?: { Id: string; Name?: string }[] | null;
  ActivityLevel?: string | null;
  DangerTypeName?: string | null;
  ValidFrom?: string | null;
  ValidTo?: string | null;
  PublishTime?: string | null;
  MainText?: string | null;
  WarningText?: string | null;
}

/** Warnings above level 1 valid from today to `days` days ahead. Language 1 = Norwegian, 2 = English. */
export async function fetchNveWarnings(hazard: Hazard, lang: 1 | 2, now = new Date(), days = 2): Promise<NveWarning[]> {
  const start = osloDate(now);
  const end = osloDate(new Date(now.getTime() + days * 24 * 3600_000));
  const data = await fetchJson<NveWarning[]>(`${API[hazard]}/Warning/${lang}/${start}/${end}`, { timeoutMs: 30_000 });
  if (!Array.isArray(data)) throw new Error(`NVE ${hazard}: unexpected response shape`);
  return data.filter(isWarning);
}

/** Placeholder rows ("xxx", green level) are not warnings. */
export const isWarning = (w: NveWarning) => /^\d+$/u.test(w.Id ?? "") && Number(w.ActivityLevel ?? 0) >= 2;

const LEVEL_COLOR: Record<string, string> = { "2": "yellow", "3": "orange", "4": "red" };

export function normalizeNve(hazard: Hazard, w: NveWarning, english: NveWarning | undefined, now = new Date()): ParsedEvent {
  const kommuner = [...new Set((w.MunicipalityList ?? []).map((m) => m.Id).filter((nr) => kommuneByNr(nr)))].sort();
  const fylker = [...new Set((w.CountyList ?? []).map((c) => findFylke(c.Id)?.nr).filter((nr): nr is string => !!nr))].sort();
  const kommune = kommuner.length === 1 ? kommuneByNr(kommuner[0]) : null;
  const fylke = fylker.length === 1 ? findFylke(fylker[0]) : null;
  const geo = centreOfKommuner(kommuner);
  const end = parseOsloTime(w.ValidTo);
  const published = parseOsloTime(w.PublishTime);

  // A new version of a warning gets a new Id but keeps its MasterId (dry-run 2026-10-14:
  // 584906/584903); each day of a multi-day warning has its own MasterId.
  const key = `${hazard}-${w.MasterId || w.Id}`;

  return {
    // Free-text "MicroBlogPostList" and other author fields are not kept.
    raw: { hazard, ...pick(w) },
    event: {
      id: eventId("nve", key),
      source: "nve",
      sourceId: key,
      groupId: w.Id,
      sourceUrl: NVE_PAGE[hazard],
      attribution: NVE_ATTRIBUTION,
      kind: "varsel",
      category: "farevarsel",
      subtype: hazard,
      title: w.MainText?.trim() || w.DangerTypeName?.trim() || (hazard === "flom" ? "Flomvarsel" : "Jordskredvarsel"),
      summary: w.WarningText?.trim() || null,
      latest: null,
      startTime: parseOsloTime(w.ValidFrom) ?? published ?? now,
      endTime: end,
      publishedAt: published,
      updatedAtSource: published,
      status: end && end.getTime() < now.getTime() ? "avsluttet" : "aktiv",
      severity: LEVEL_COLOR[String(w.ActivityLevel)] ?? null,
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? null,
      fylkeNr: fylke?.nr ?? null,
      fylkeNavn: fylke?.navn ?? null,
      kommuner,
      fylker,
      place: null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "omrade" : "mangler",
      en: english
        ? { title: english.MainText?.trim() || english.DangerTypeName?.trim() || "", summary: english.WarningText?.trim() || null }
        : null,
    },
  };
}

function pick(w: NveWarning): NveWarning {
  const { Id, MasterId, Version, LangKey, CountyList, MunicipalityList, ActivityLevel, DangerTypeName, ValidFrom, ValidTo, PublishTime, MainText, WarningText } = w;
  return {
    Id,
    MasterId,
    Version,
    LangKey,
    CountyList: CountyList?.map(({ Id: id, Name }) => ({ Id: id, Name })),
    MunicipalityList: MunicipalityList?.map(({ Id: id, Name }) => ({ Id: id, Name })),
    ActivityLevel,
    DangerTypeName,
    ValidFrom,
    ValidTo,
    PublishTime,
    MainText,
    WarningText,
  };
}
