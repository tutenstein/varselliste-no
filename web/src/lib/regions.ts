// Region data is generated once (functions/scripts/build-regions.mjs) and shared with the Cloud Functions.
import { FYLKER, KOMMUNER } from "../../../functions/src/data/regions";

export interface Fylke {
  code: string;
  name: string;
  slug: string;
}

export interface Kommune {
  code: string;
  name: string;
  slug: string; // unique; Herøy and Våler carry the fylke ("heroy-nordland")
  fylke: string; // fylke code
}

const sortNb = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "nb");

export const FYLKE_LIST: Fylke[] = Object.entries(FYLKER)
  .map(([code, f]) => ({ code, name: f.navn, slug: f.slug }))
  .sort(sortNb);

export const KOMMUNE_LIST: Kommune[] = Object.entries(KOMMUNER)
  .map(([code, k]) => ({ code, name: k.navn, slug: k.slug, fylke: k.fylke }))
  .sort(sortNb);

export const fylkeByCode = new Map(FYLKE_LIST.map((f) => [f.code, f]));
export const kommuneByCode = new Map(KOMMUNE_LIST.map((k) => [k.code, k]));

export function fylkeName(code: string | null | undefined): string | null {
  return code ? (fylkeByCode.get(code)?.name ?? null) : null;
}

export function kommuneName(code: string | null | undefined): string | null {
  return code ? (kommuneByCode.get(code)?.name ?? null) : null;
}

/** Same-named kommuner (Herøy, Våler) need the fylke to be told apart in lists. */
const nameCount = new Map<string, number>();
for (const k of KOMMUNE_LIST) nameCount.set(k.name, (nameCount.get(k.name) ?? 0) + 1);
export const isAmbiguousName = (name: string) => (nameCount.get(name) ?? 0) > 1;
