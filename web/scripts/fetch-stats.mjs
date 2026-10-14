// Build-time statistics for the kommune and fylke pages (runs in GitHub Actions, not Firebase).
//   - SSB 12058 (KOSTRA, brann- og ulykkesvern): call-outs, building fires, residential fires per kommune and year
//   - SSB 11342: population per kommune (for per-1000 rates)
// Licence CC BY 4.0, "Kilde: Statistisk sentralbyrå". SSB allows 40 requests per minute; this makes two.
// On any failure the committed src/data/stats.json is kept, so the build never breaks.
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../src/data/stats.json", import.meta.url);
const SSB = "https://data.ssb.no/api/pxwebapi/v2/tables";
const YEARS = 5;
const UA = "Varsellisten/0.1 (build; +https://varselliste-no.web.app)";

async function ssb(table, params) {
  const url = `${SSB}/${table}/data?lang=no&${params}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`SSB ${table}: HTTP ${res.status}`);
  return res.json();
}

/** json-stat2 → Map<region, Map<contents, Map<year, number>>>. */
function cube(ds, regionDim) {
  const labels = ds.id.map((dim) => Object.entries(ds.dimension[dim].category.index).sort((a, b) => a[1] - b[1]).map(([k]) => k));
  const at = (dim) => ds.id.indexOf(dim);
  const out = new Map();
  ds.value.forEach((value, flat) => {
    if (value == null) return;
    let rest = flat;
    const coords = new Array(ds.id.length);
    for (let d = ds.id.length - 1; d >= 0; d--) {
      coords[d] = rest % ds.size[d];
      rest = Math.floor(rest / ds.size[d]);
    }
    const region = labels[at(regionDim)][coords[at(regionDim)]];
    const contents = labels[at("ContentsCode")][coords[at("ContentsCode")]];
    const year = labels[at("Tid")][coords[at("Tid")]];
    const byContents = out.get(region) ?? new Map();
    const byYear = byContents.get(contents) ?? new Map();
    byYear.set(year, value);
    byContents.set(contents, byYear);
    out.set(region, byContents);
  });
  return { out, years: labels[at("Tid")] };
}

async function main() {
  const brann = await ssb(
    "12058",
    [
      "valueCodes[KOKkommuneregion0000]=*",
      "codelist[KOKkommuneregion0000]=agg_KOGkommuneregion000005402",
      "outputValues[KOKkommuneregion0000]=single",
      "valueCodes[ContentsCode]=KOSutrykningerto0000,KOSbygningsbrann0000,KOSboligbranner0000",
      `valueCodes[Tid]=top(${YEARS})`,
    ].join("&"),
  );
  const pop = await ssb(
    "11342",
    [
      "valueCodes[Region]=*",
      "codelist[Region]=agg_KommGjeldende",
      "outputValues[Region]=single",
      "valueCodes[ContentsCode]=Folkemengde",
      "valueCodes[Tid]=top(1)",
    ].join("&"),
  );

  const b = cube(brann, "KOKkommuneregion0000");
  const p = cube(pop, "Region");
  const years = [...b.years].sort();
  const popYear = p.years[0];
  const series = (k, code) => years.map((y) => b.out.get(k)?.get(code)?.get(y) ?? null);

  const kommuner = {};
  for (const k of b.out.keys()) {
    if (!/^\d{4}$/u.test(k)) continue; // "Landet", Longyearbyen etc.
    kommuner[k] = {
      pop: p.out.get(k)?.get("Folkemengde")?.get(popYear) ?? null,
      callouts: series(k, "KOSutrykningerto0000"),
      buildingFires: series(k, "KOSbygningsbrann0000"),
      homeFires: series(k, "KOSboligbranner0000"),
    };
  }
  if (Object.keys(kommuner).length < 300) throw new Error(`only ${Object.keys(kommuner).length} kommuner in SSB 12058`);

  const stats = {
    generatedAt: new Date().toISOString(),
    years,
    populationYear: popYear,
    sources: {
      brann: "SSB 12058 – Brann- og ulykkesvern (KOSTRA): utrykninger, bygningsbranner, boligbranner",
      befolkning: "SSB 11342 – Areal og befolkning: folkemengde 1. januar",
    },
    kommuner,
  };
  await writeFile(OUT, `${JSON.stringify(stats)}\n`);
  console.log(`stats.json: ${Object.keys(kommuner).length} kommuner, years ${years.join(", ")}, population ${popYear}`);
}

main().catch(async (err) => {
  const existing = await readFile(OUT, "utf8").catch(() => null);
  console.warn(`fetch-stats failed (${err.message}); ${existing ? "keeping committed stats.json" : "no stats available"}`);
  if (!existing) await writeFile(OUT, `${JSON.stringify({ generatedAt: null, years: [], kommuner: {} })}\n`);
});
