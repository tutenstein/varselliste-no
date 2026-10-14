import { FYLKER, KOMMUNER } from "../data/regions";
import { KOMMUNE_GEO } from "../data/kommuneGeo";
import { GeoPoint } from "./model";

export interface Kommune {
  nr: string;
  navn: string;
  fylkeNr: string;
  fylkeNavn: string;
}

export interface Fylke {
  nr: string;
  navn: string;
}

/** Lower case, " kommune" and SSB-style "(Fylke)" suffixes dropped, hyphens treated as spaces. */
export function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/\s+(kommune|herad)$/u, "")
    .replace(/[-\s]+/gu, " ");
}

const toKommune = (nr: string): Kommune => {
  const k = KOMMUNER[nr];
  return { nr, navn: k.navn, fylkeNr: k.fylke, fylkeNavn: FYLKER[k.fylke].navn };
};

const kommunerByName = new Map<string, string[]>();
for (const [nr, k] of Object.entries(KOMMUNER)) {
  for (const name of [k.navn, ...(k.alias ?? [])]) {
    const key = normName(name);
    const list = kommunerByName.get(key) ?? [];
    if (!list.includes(nr)) list.push(nr);
    kommunerByName.set(key, list);
  }
}

const fylkeByName = new Map<string, string>();
for (const [nr, f] of Object.entries(FYLKER)) fylkeByName.set(normName(f.navn), nr);

export function kommuneByNr(nr: string | null | undefined): Kommune | null {
  return nr && KOMMUNER[nr] ? toKommune(nr) : null;
}

/**
 * Finds a kommune by name. Herøy and Våler exist twice; `inFylker` (e.g. from the
 * police district) picks the right one, otherwise an ambiguous name returns null.
 */
export function findKommune(name: string | null | undefined, inFylker?: string[]): Kommune | null {
  if (!name) return null;
  const candidates = kommunerByName.get(normName(name)) ?? [];
  if (candidates.length === 1) return toKommune(candidates[0]);
  const narrowed = inFylker ? candidates.filter((nr) => inFylker.includes(KOMMUNER[nr].fylke)) : [];
  return narrowed.length === 1 ? toKommune(narrowed[0]) : null;
}

/** Accepts "Vestland", "46" or 46. */
export function findFylke(nameOrNr: string | number | null | undefined): Fylke | null {
  if (nameOrNr === null || nameOrNr === undefined || nameOrNr === "") return null;
  const s = String(nameOrNr).trim();
  const nr = /^\d{1,2}$/u.test(s) ? s.padStart(2, "0") : fylkeByName.get(normName(s));
  return nr && FYLKER[nr] ? { nr, navn: FYLKER[nr].navn } : null;
}

export function kommuneCentre(nr: string | null | undefined): GeoPoint | null {
  const p = nr ? KOMMUNE_GEO[nr] : undefined;
  return p ? { lat: p[0], lng: p[1] } : null;
}

/** Average of the kommune centre points — a rough "area" point for multi-kommune warnings. */
export function centreOfKommuner(nrs: string[]): GeoPoint | null {
  const points = nrs.map(kommuneCentre).filter((p): p is GeoPoint => p !== null);
  if (!points.length) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}

// Kommune names in running text: matched case-sensitively on whole words, longest names
// first ("Nordre Follo" before "Follo"), so common nouns like "time" or "fjord" don't match.
const namesForText = Object.entries(KOMMUNER)
  .flatMap(([nr, k]) => [k.navn, ...(k.alias ?? [])].map((name) => ({ nr, name })))
  .sort((a, b) => b.name.length - a.name.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const textPatterns = namesForText.map(({ nr, name }) => ({
  nr,
  re: new RegExp(`(?<![\\p{L}\\d-])${escape(name)}(?![\\p{L}\\d-])`, "u"),
}));

/** First kommune named in a text, optionally restricted to some fylker. */
export function findKommuneInText(text: string | null | undefined, inFylker?: string[]): Kommune | null {
  if (!text) return null;
  for (const { nr, re } of textPatterns) {
    if (inFylker && !inFylker.includes(KOMMUNER[nr].fylke)) continue;
    if (re.test(text)) {
      // Herøy / Våler without a fylke hint are ambiguous.
      const same = namesForText.filter((n) => n.name === KOMMUNER[nr].navn).map((n) => n.nr);
      if (!inFylker && new Set(same).size > 1) return null;
      return toKommune(nr);
    }
  }
  return null;
}

/**
 * Police districts → fylker they (mostly) cover. Only used to tell apart kommuner
 * that share a name, so approximate borders are fine.
 */
const DISTRICT_FYLKER: Record<string, string[]> = {
  oslo: ["03", "32"],
  øst: ["31", "32", "33"],
  innlandet: ["34", "32", "33"],
  sørøst: ["33", "39", "40"],
  agder: ["42"],
  sørvest: ["11", "46"],
  vest: ["46"],
  møreogromsdal: ["15"],
  trøndelag: ["50", "18"],
  nordland: ["18"],
  troms: ["55", "18"],
  finnmark: ["56"],
};

/** "Vest Politidistrikt", "Sør-Øst politidistrikt", "MøreOgRomsdal" → fylke numbers. */
export function fylkerForDistrict(district: string | null | undefined): string[] | undefined {
  if (!district) return undefined;
  const key = district
    .toLowerCase()
    .replace(/politidistrikt/gu, "")
    .replace(/[-\s]+/gu, "");
  return DISTRICT_FYLKER[key];
}
