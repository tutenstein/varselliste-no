import { fetchText, sleep } from "../lib/http";
import { encodeGeohash } from "../lib/geohash";
import { Category, eventId, ParsedEvent } from "../lib/model";
import { findFylke, findKommuneInText, kommuneCentre } from "../lib/regions";
import { parseRss, RssItem, rssDate } from "../lib/rss";

/**
 * NRK news links, shown in a separate "Nyheter" block, never mixed into the incident list.
 *
 * Terms (https://www.nrk.no/rss/): free to use with links straight to nrk.no, labelled
 * "Nyheter fra NRK", kept apart from other content; titles and texts must not be
 * altered and articles, parts of articles or images must not be copied. We store only
 * the unchanged title, the link and the time — the description is used for nothing.
 *
 * Only incident-related items are kept (our own keyword classification of the title).
 * (Hovedredningssentralen's RSS was dropped on 2026-10-14: it refuses connections from
 * Google Cloud.)
 */
export const NRK_ATTRIBUTION = "Nyheter fra NRK";

/** NRK district feeds → the fylker they cover. */
export const NRK_FEEDS: { district: string; url: string; fylker: string[] }[] = [
  { district: "stor-oslo", fylker: ["03", "32"] },
  { district: "ostfold", fylker: ["31"] },
  { district: "buskerud", fylker: ["33"] },
  { district: "innlandet", fylker: ["34"] },
  { district: "vestfoldogtelemark", fylker: ["39", "40"] },
  { district: "sorlandet", fylker: ["42"] },
  { district: "rogaland", fylker: ["11"] },
  { district: "vestland", fylker: ["46"] },
  { district: "mr", fylker: ["15"] },
  { district: "trondelag", fylker: ["50"] },
  { district: "nordland", fylker: ["18"] },
  { district: "tromsogfinnmark", fylker: ["55", "56"] },
].map((f) => ({ ...f, url: `https://www.nrk.no/${f.district}/siste.rss` }));

export async function fetchRss(url: string): Promise<RssItem[]> {
  const res = await fetchText(url, { headers: { Accept: "application/rss+xml, application/xml" }, attempts: 2 });
  if (!/<rss[\s>]/u.test(res.text)) throw new Error(`${url}: not an RSS document`);
  return parseRss(res.text);
}

/** Fetches the NRK district feeds one after another (a short pause between them). */
export async function fetchNrk(): Promise<{ feed: (typeof NRK_FEEDS)[number]; items: RssItem[] }[]> {
  const out: { feed: (typeof NRK_FEEDS)[number]; items: RssItem[] }[] = [];
  for (const feed of NRK_FEEDS) {
    out.push({ feed, items: await fetchRss(feed.url) });
    await sleep(500);
  }
  return out;
}

// Keyword classification of headlines (bokmål and nynorsk). JavaScript's \b does not know
// æ/ø/å, so word edges are written as Unicode lookarounds: `w(…)` = a whole word,
// `s(…)` = a word start (compounds like "skipsbrann" are matched explicitly).
const w = (alts: string) => `(?<![\\p{L}\\d])(?:${alts})(?![\\p{L}\\d])`;
const s = (alts: string) => `(?<![\\p{L}\\d])(?:${alts})`;
const re = (...parts: string[]) => new RegExp(parts.join("|"), "iu");

/** Not incidents: the football club SK Brann ("Brann får …", "Brann – Rosenborg"). */
const SPORT = new RegExp(`^Brann\\s+${w("får|fekk|vant|vann|tapte|tapa|slo|møter|mot|sikra|sikret|henter|hentar|signerer|klar|og|–|-")}`, "u");

/** Not incidents for the news block: crime and traffic enforcement (the police log covers those). */
const CRIME = re(
  w("ran|ranet|ranar"),
  s("knivstukk|drept|drap|voldtekt|pågrepet|pågripen|siktet|sikta|tiltalt|dømt|ruskjør|ruskøyr|promille|fyllekjør"),
  `\\d+\\s?(?:km|m)\\/t`,
  `\\d+-sone`,
);

const RULES: [Category, RegExp][] = [
  // "brann" in lower case (incl. compounds: skipsbrann, boligbrann); "Brann i/på …" at the start.
  [
    "brann",
    new RegExp(
      `brann|^Brann\\s+${w("i|på|ved|nær|om|under|etter|blussa|blusset|slukka|slukket|er|har")}|${s("brenn|brant|røykutvikling|røykutvikla|eksplosjon|gasslekkasje|flammer")}`,
      "u",
    ),
  ],
  [
    "trafikkulykke",
    re(
      s("trafikkulykk|trafikkulukk|bilulykk|bilulukk|mc-ulykk|mc-ulukk|sykkelulykk|sykkelulukk|bussulykk|kollisjon|kolliderte|kolliderte|frontkollisjon|kjedekollisjon|påkjørt|påkøyrd|påkøyrt|utforkjøring|utforkøyring|velta|veltet|veltet"),
      "kjørte av (?:veg|vei)|køyrde av vegen|i grøfta|i grøfte",
      `${s("bil|bilar|biler|vogntog|buss|lastebil|motorsykkel|mc|personbil")}[^.]*${s("ulykk|ulukk")}`,
    ),
  ],
  [
    "redning",
    re(
      s("redningsaksjon|redningsaksjonen|leteaksjon|leiteaksjon|savnet|sakna|drukn|arbeidsulykk|arbeidsulukk|luftambulanse|redningshelikopter|kantra|kantret|grunnstøt|skred|snøskred|jordskred|evakuer|fastklemt|forlis"),
      w("ras|ulykke|ulykka|ulukke|ulukka|slep"),
      `alvorle(?:g|ig) skad`,
    ),
  ],
  [
    "trafikk",
    re(
      s("stengt|stengd|stenger|trafikkaos|omkjøring|bilberging|fjellovergang|kolonnekjøring|kolonnekøyring"),
      w("kø|køer|køar|køen"),
      `${s("sperr")}[^.]*${s("veg|vei|tunnel|bru|e\\d|fv|rv")}`,
      `${s("ferje|ferge|hurtigbåt|båt|tog|avgang|samband|rute|fly")}[^.]*${s("innstilt|innstilte|innstiller")}`,
      `${s("innstilt|innstiller")}[^.]*${s("ferje|ferge|hurtigbåt|avgang|samband|rute")}`,
      `mots(?:att|ett) (?:kjørefelt|køyrefelt)`,
    ),
  ],
  ["farevarsel", re(s("farevarsel|ekstremvær|flaum|flom|storm|uvær|styrtregn|kuling"))],
];

export function classifyHeadline(title: string): Category | null {
  if (SPORT.test(title) || CRIME.test(title)) return null;
  for (const [category, pattern] of RULES) if (pattern.test(title)) return category;
  return null;
}


/** NRK article id ("…-1.18054427"), otherwise the last path segment. */
export function newsItemId(item: RssItem): string {
  const nrk = /-(\d+\.\d+)(?:[/?#]|$)/u.exec(item.link ?? "");
  if (nrk) return nrk[1];
  const url = item.guid ?? item.link ?? item.title;
  const last = url.split(/[/?#]/u).filter(Boolean).pop() ?? url;
  return last.replace(/[^\w.-]/gu, "").slice(0, 120) || "ukjent";
}

export function normalizeNrk(item: RssItem, fylker: string[] | null, now = new Date()): ParsedEvent | null {
  const title = item.title.trim();
  const category = classifyHeadline(title);
  if (!title || !category) return null;
  const kommune = findKommuneInText(title, fylker ?? undefined);
  const fylke = kommune ? { nr: kommune.fylkeNr, navn: kommune.fylkeNavn } : fylker?.length === 1 ? findFylke(fylker[0]) : null;
  const geo = kommune ? kommuneCentre(kommune.nr) : null;
  const time = rssDate(item) ?? now;
  const id = newsItemId(item);

  return {
    // Only what we are allowed to show: unchanged title, link, time.
    raw: { title: item.title, link: item.link, guid: item.guid, time: time.toISOString() },
    event: {
      id: eventId("nrk", id),
      source: "nrk",
      sourceId: id,
      groupId: null,
      sourceUrl: item.link,
      attribution: NRK_ATTRIBUTION,
      kind: "nyhet",
      category,
      subtype: category,
      title,
      summary: null,
      latest: null,
      startTime: time,
      endTime: null,
      publishedAt: time,
      updatedAtSource: time,
      status: "ukjent",
      severity: null,
      kommuneNr: kommune?.nr ?? null,
      kommuneNavn: kommune?.navn ?? null,
      fylkeNr: fylke?.nr ?? null,
      fylkeNavn: fylke?.navn ?? null,
      kommuner: [],
      fylker: fylker ?? [],
      place: null,
      roadNumber: null,
      geo,
      geohash: geo ? encodeGeohash(geo.lat, geo.lng) : null,
      geoPrecision: geo ? "kommune" : fylke ? "fylke" : "mangler",
      en: null,
    },
  };
}
