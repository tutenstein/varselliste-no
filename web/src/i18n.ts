import type { Category, FeedEvent } from "./lib/feed";

export type Lang = "nb" | "en";
export const LANGS: Lang[] = ["nb", "en"];

// ---------------------------------------------------------------- routes

export const routes = {
  home: (l: Lang) => (l === "nb" ? "/" : "/en/"),
  fylke: (l: Lang, slug: string) => (l === "nb" ? `/fylke/${slug}/` : `/en/county/${slug}/`),
  kommune: (l: Lang, slug: string) => (l === "nb" ? `/kommune/${slug}/` : `/en/municipality/${slug}/`),
  directory: (l: Lang) => (l === "nb" ? "/kommuner/" : "/en/municipalities/"),
  about: (l: Lang) => (l === "nb" ? "/om/" : "/en/about/"),
};

/** The same page in the other language. */
export function alternatePath(path: string, to: Lang): string {
  const pairs: [RegExp, (m: RegExpMatchArray) => string][] =
    to === "en"
      ? [
          [/^\/fylke\/([^/]+)\/$/u, (m) => routes.fylke("en", m[1])],
          [/^\/kommune\/([^/]+)\/$/u, (m) => routes.kommune("en", m[1])],
          [/^\/kommuner\/$/u, () => routes.directory("en")],
          [/^\/om\/$/u, () => routes.about("en")],
        ]
      : [
          [/^\/en\/county\/([^/]+)\/$/u, (m) => routes.fylke("nb", m[1])],
          [/^\/en\/municipality\/([^/]+)\/$/u, (m) => routes.kommune("nb", m[1])],
          [/^\/en\/municipalities\/$/u, () => routes.directory("nb")],
          [/^\/en\/about\/$/u, () => routes.about("nb")],
        ];
  for (const [re, fn] of pairs) {
    const m = path.match(re);
    if (m) return fn(m);
  }
  return routes.home(to);
}

// ---------------------------------------------------------------- UI strings

const nb = {
  siteName: "Varsellisten",
  tagline: "Ulykker, brann, redning og trafikkhendelser i hele Norge – samlet fra åpne kilder",
  nav: { events: "Hendelser", directory: "Kommuner", about: "Om tjenesten" },
  skip: "Hopp til innholdet",
  emergency: "Ved nødsituasjon: ring 110 (brann), 112 (politi) eller 113 (ambulanse)",
  notOfficial: "Varsellisten er en uavhengig sammenstilling av åpne data og ingen offentlig tjeneste.",
  live: "Live",
  updated: "Oppdatert",
  loading: "Henter hendelser …",
  loadError: "Kunne ikke hente hendelser akkurat nå. Prøver igjen automatisk.",
  retry: "Prøv igjen",
  range: { "24h": "24 timer", "7d": "7 dager", "30d": "30 dager" },
  rangeShort: { "24h": "24 t", "7d": "7 d", "30d": "30 d" },
  rangeLabel: "Tidsrom",
  categoriesLabel: "Kategorier",
  allNorway: "Hele Norge",
  county: "Fylke",
  search: "Søk",
  searchPlaceholder: "Søk type, sted, vei (f.eks. E6) …",
  nearMe: "Nær meg",
  nearMeActive: (km: number) => `Innen ${km} km`,
  distance: "Avstand",
  locating: "Finner posisjon …",
  geoDenied: "Posisjonstilgang ble avslått. Du kan fortsatt filtrere på fylke.",
  geoUnsupported: "Nettleseren din støtter ikke posisjon.",
  geoNote: "Posisjonen din brukes bare i nettleseren og lagres ikke.",
  results: (n: number) => (n === 1 ? "1 hendelse" : `${n} hendelser`),
  noResults: "Ingen hendelser passer filtrene.",
  clearFilters: "Nullstill filtre",
  showMore: "Vis flere",
  today: "I dag",
  yesterday: "I går",
  ongoing: "Pågår",
  ended: "Avsluttet",
  approxLocation: "Omtrentlig plassering (midt i kommunen)",
  source: "Kilde",
  latest: "Siste oppdatering",
  warningsTitle: "Farevarsler nå",
  warningsCount: (n: number) => (n === 1 ? "1 aktivt farevarsel" : `${n} aktive farevarsler`),
  until: "til",
  showAll: "Vis alle",
  hide: "Skjul",
  nodvarselTitle: "Nødvarsel",
  nodvarselNote: "Varsel sendt til mobiltelefoner i et område. Følg rådene i varselet.",
  nodvarselLink: "Les varselet på nodvarsel.no",
  stats: { topTypes: "Vanligste hendelser", topPlaces: "Mest aktive områder" },
  map: { show: "Vis kart", hide: "Skjul kart", title: "Kart", approx: "Omtrentlige plasseringer vises som ringer." },
  ago: { now: "nå nettopp", min: (n: number) => `${n} min siden`, h: (n: number) => `${n} t siden` },
  categories: {
    trafikkulykke: "Trafikkulykker",
    brann: "Branner",
    redning: "Redning",
    trafikk: "Trafikk",
    kriminalitet: "Kriminalitet",
    annet: "Annet",
    farevarsel: "Farevarsler",
    nodvarsel: "Nødvarsler",
    vegarbeid: "Vegarbeid",
  } as Record<Category, string>,
  category1: {
    trafikkulykke: "Trafikkulykke",
    brann: "Brann",
    redning: "Redning",
    trafikk: "Trafikkhendelse",
    kriminalitet: "Kriminalitet",
    annet: "Annet",
    farevarsel: "Farevarsel",
    nodvarsel: "Nødvarsel",
    vegarbeid: "Vegarbeid",
  } as Record<Category, string>,
  sources: {
    politiloggen: "Politiloggen",
    vegvesen: "Statens vegvesen",
    metalerts: "Meteorologisk institutt",
    nve: "Varsom (NVE)",
    nodvarsel: "nodvarsel.no",
    nrk: "NRK",
  } as Record<string, string>,
  newsTitle: "Nyheter",
  newsFrom: { nrk: "Nyheter fra NRK" } as Record<string, string>,
  newsNote: "Overskrifter om hendelser fra NRK, uendret og med lenke til saken.",
  // pages
  homeTitle: "Varsellisten – ulykker, brann og trafikkhendelser i sanntid",
  homeLead: "Siste hendelser i Norge",
  countiesTitle: "Fylker",
  fylkeTitle: (name: string) => `Hendelser i ${name}`,
  fylkeLead: (name: string) => `Ulykker, branner, redningsaksjoner og trafikkhendelser i ${name}.`,
  kommuneTitle: (name: string) => `Hendelser i ${name}`,
  kommuneLead: (name: string, fylke: string) => `Siste ulykker, branner og hendelser i ${name} kommune, ${fylke}.`,
  kommunerIn: (name: string) => `Kommuner i ${name}`,
  directoryTitle: "Alle kommuner A–Å",
  directoryLead: "Velg en kommune for å se hendelser og statistikk.",
  letters: "Bokstaver",
  statsTitle: (name: string) => `Brannvesenets utrykninger i ${name}`,
  statsLead: "Årlig statistikk over brann- og redningsvesenets utrykninger (KOSTRA). Utrykninger telles i kommunen som rykker ut.",
  statsEvents: "Alle utrykninger",
  statsPer1000: "per 1 000 innbyggere",
  statsBuildingFires: "Bygningsbranner",
  statsHomeFires: "Boligbranner",
  statsSource: "Kilde: Statistisk sentralbyrå (SSB), tabell 12058 og 11342, CC BY 4.0",
  population: "Innbyggere",
  aboutTitle: "Om Varsellisten",
  sourcesTitle: "Kilder og dekning",
  sourceStatusTitle: "Status for kildene",
  lastSuccess: "Sist hentet",
  statusOk: "Fungerer",
  statusDelayed: "Forsinket",
  statusDown: "Feil",
  notFoundTitle: "Siden finnes ikke",
  notFoundLead: "Siden finnes ikke, eller den er flyttet.",
  backHome: "Til forsiden",
  language: "Språk",
  mainMenu: "Hovedmeny",
  breadcrumb: "Brødsmulesti",
  dataInNorwegian: "",
};

type Dict = typeof nb;

const en: Dict = {
  siteName: "Varsellisten",
  tagline: "Accidents, fires, rescues and traffic incidents across Norway – compiled from open data",
  nav: { events: "Incidents", directory: "Municipalities", about: "About" },
  skip: "Skip to content",
  emergency: "In an emergency call 110 (fire), 112 (police) or 113 (ambulance)",
  notOfficial: "Varsellisten is an independent compilation of open data and not a government service.",
  live: "Live",
  updated: "Updated",
  loading: "Loading incidents …",
  loadError: "Couldn't load incidents right now. Retrying automatically.",
  retry: "Retry",
  range: { "24h": "24 hours", "7d": "7 days", "30d": "30 days" },
  rangeShort: { "24h": "24 h", "7d": "7 d", "30d": "30 d" },
  rangeLabel: "Time range",
  categoriesLabel: "Categories",
  allNorway: "All of Norway",
  county: "County",
  search: "Search",
  searchPlaceholder: "Search type, place, road (e.g. E6) …",
  nearMe: "Near me",
  nearMeActive: (km: number) => `Within ${km} km`,
  distance: "Distance",
  locating: "Locating …",
  geoDenied: "Location access was denied. You can still filter by county.",
  geoUnsupported: "Your browser doesn't support location access.",
  geoNote: "Your location stays in your browser and is never stored.",
  results: (n: number) => (n === 1 ? "1 incident" : `${n} incidents`),
  noResults: "No incidents match the filters.",
  clearFilters: "Clear filters",
  showMore: "Show more",
  today: "Today",
  yesterday: "Yesterday",
  ongoing: "Ongoing",
  ended: "Ended",
  approxLocation: "Approximate location (centre of the municipality)",
  source: "Source",
  latest: "Latest update",
  warningsTitle: "Current warnings",
  warningsCount: (n: number) => (n === 1 ? "1 active warning" : `${n} active warnings`),
  until: "until",
  showAll: "Show all",
  hide: "Hide",
  nodvarselTitle: "Emergency alert",
  nodvarselNote: "Alert sent to mobile phones in an area. Follow the advice in the alert.",
  nodvarselLink: "Read the alert on nodvarsel.no",
  stats: { topTypes: "Most common incidents", topPlaces: "Most active areas" },
  map: { show: "Show map", hide: "Hide map", title: "Map", approx: "Approximate locations are drawn as rings." },
  ago: { now: "just now", min: (n: number) => `${n} min ago`, h: (n: number) => `${n} h ago` },
  categories: {
    trafikkulykke: "Traffic accidents",
    brann: "Fires",
    redning: "Rescue",
    trafikk: "Traffic",
    kriminalitet: "Crime",
    annet: "Other",
    farevarsel: "Warnings",
    nodvarsel: "Emergency alerts",
    vegarbeid: "Roadworks",
  },
  category1: {
    trafikkulykke: "Traffic accident",
    brann: "Fire",
    redning: "Rescue",
    trafikk: "Traffic incident",
    kriminalitet: "Crime",
    annet: "Other",
    farevarsel: "Warning",
    nodvarsel: "Emergency alert",
    vegarbeid: "Roadworks",
  },
  sources: {
    politiloggen: "Norwegian Police (Politiloggen)",
    vegvesen: "Norwegian Public Roads Administration",
    metalerts: "MET Norway",
    nve: "Varsom (NVE)",
    nodvarsel: "nodvarsel.no",
    nrk: "NRK",
  },
  newsTitle: "News",
  newsFrom: { nrk: "News from NRK" },
  newsNote: "Headlines about incidents from NRK, unchanged and linked to the story (in Norwegian).",
  homeTitle: "Varsellisten – live accidents, fires and traffic incidents in Norway",
  homeLead: "Latest incidents in Norway",
  countiesTitle: "Counties",
  fylkeTitle: (name: string) => `Incidents in ${name}`,
  fylkeLead: (name: string) => `Accidents, fires, rescue operations and traffic incidents in ${name}.`,
  kommuneTitle: (name: string) => `Incidents in ${name}`,
  kommuneLead: (name: string, fylke: string) => `Latest accidents, fires and incidents in ${name} municipality, ${fylke}.`,
  kommunerIn: (name: string) => `Municipalities in ${name}`,
  directoryTitle: "All municipalities A–Å",
  directoryLead: "Pick a municipality to see incidents and statistics.",
  letters: "Letters",
  statsTitle: (name: string) => `Fire and rescue call-outs in ${name}`,
  statsLead: "Yearly statistics for fire and rescue service call-outs (KOSTRA). Call-outs are counted in the municipality that responds.",
  statsEvents: "All call-outs",
  statsPer1000: "per 1,000 residents",
  statsBuildingFires: "Building fires",
  statsHomeFires: "Residential fires",
  statsSource: "Source: Statistics Norway (SSB), tables 12058 and 11342, CC BY 4.0",
  population: "Residents",
  aboutTitle: "About Varsellisten",
  sourcesTitle: "Sources and coverage",
  sourceStatusTitle: "Source status",
  lastSuccess: "Last fetched",
  statusOk: "Working",
  statusDelayed: "Delayed",
  statusDown: "Error",
  notFoundTitle: "Page not found",
  notFoundLead: "This page doesn't exist or has moved.",
  backHome: "Back to the start page",
  language: "Language",
  mainMenu: "Main menu",
  breadcrumb: "Breadcrumb",
  dataInNorwegian: "Incident texts are shown in Norwegian, as published by the source.",
};

export const ui: Record<Lang, Dict> = { nb, en };
export const t = (lang: Lang) => ui[lang];

// ---------------------------------------------------------------- type labels

/** Politiloggen categories in English. */
const POLICE_EN: Record<string, string> = {
  Brann: "Fire",
  Redning: "Rescue",
  Savnet: "Missing person",
  Sjø: "Sea",
  Ulykke: "Accident",
  Trafikk: "Traffic",
  Trafikkontroll: "Traffic enforcement",
  Innbrudd: "Burglary",
  Tyveri: "Theft",
  Voldshendelse: "Violence",
  "Ro og orden": "Public order",
  Skadeverk: "Vandalism",
  Dyr: "Animals",
  Vær: "Weather",
  Arrangement: "Event",
  "Andre hendelser": "Other incidents",
};

/**
 * DATEX situation record types (Statens vegvesen) → our own labels. The source's
 * Norwegian free text is never translated (DATEX terms); these labels come from the codes.
 */
const VEGVESEN: Record<string, [string, string]> = {
  "Accident/accident": ["Trafikkulykke", "Traffic accident"],
  Accident: ["Trafikkulykke", "Traffic accident"],
  "VehicleObstruction/brokenDownVehicle": ["Stanset kjøretøy", "Stopped vehicle"],
  "VehicleObstruction/vehicleOnFire": ["Bilbrann", "Vehicle fire"],
  VehicleObstruction: ["Kjøretøy i vegbanen", "Vehicle on the road"],
  "RoadsideAssistance/vehicleRecovery": ["Berging av kjøretøy", "Vehicle recovery"],
  RoadsideAssistance: ["Berging av kjøretøy", "Vehicle recovery"],
  "GeneralObstruction/objectOnTheRoad": ["Gjenstand i vegbanen", "Object on the road"],
  "GeneralObstruction/peopleOnRoadway": ["Personer i vegbanen", "People on the road"],
  GeneralObstruction: ["Hindring i vegbanen", "Obstruction on the road"],
  AnimalPresenceObstruction: ["Dyr i vegbanen", "Animals on the road"],
  "EnvironmentalObstruction/fallenTrees": ["Trær over vegen", "Fallen trees"],
  "EnvironmentalObstruction/rockfalls": ["Steinsprang", "Rockfall"],
  "EnvironmentalObstruction/landslips": ["Jordskred", "Landslide"],
  "EnvironmentalObstruction/avalanches": ["Snøskred", "Avalanche"],
  "EnvironmentalObstruction/flooding": ["Flom", "Flooding"],
  EnvironmentalObstruction: ["Naturfare på vegen", "Natural hazard on the road"],
  NonWeatherRelatedRoadConditions: ["Glatt veg", "Slippery road"],
  InfrastructureDamageObstruction: ["Skade på vegen", "Road damage"],
  "PoorEnvironmentConditions/strongWinds": ["Sterk vind", "Strong winds"],
  PoorEnvironmentConditions: ["Vanskelige kjøreforhold", "Poor driving conditions"],
  "TransitInformation/ferry": ["Ferje innstilt", "Ferry cancelled"],
};

const LEVEL: Record<Lang, Record<string, string>> = {
  nb: { yellow: "Gult nivå", orange: "Oransje nivå", red: "Rødt nivå" },
  en: { yellow: "Yellow level", orange: "Orange level", red: "Red level" },
};

const IMPACT: Record<Lang, Record<string, string>> = {
  nb: { high: "Stor betydning", highest: "Svært stor betydning" },
  en: { high: "Major impact", highest: "Severe impact" },
};

export function warningLevel(lang: Lang, code: string | null): string | null {
  return code ? (LEVEL[lang][code] ?? null) : null;
}

/** Severity chip text, or null when there is nothing worth showing. */
export function severityLabel(lang: Lang, ev: FeedEvent): string | null {
  if (ev.s === "metalerts" || ev.s === "nve") return warningLevel(lang, ev.sv);
  if (ev.s === "vegvesen") return ev.sv ? (IMPACT[lang][ev.sv] ?? null) : null;
  return null;
}

export function typeLabel(lang: Lang, ev: FeedEvent): string {
  const en = lang === "en";
  switch (ev.s) {
    case "metalerts":
    case "nve":
      return en && ev.e ? ev.e.ti : ev.ti;
    case "nodvarsel":
    case "nrk":
      return ev.ti;
    case "vegvesen": {
      const label = VEGVESEN[ev.t] ?? VEGVESEN[ev.t.split("/")[0]];
      return label ? label[en ? 1 : 0] : ui[lang].category1[ev.c];
    }
    case "politiloggen":
      // "Trafikk" threads split into accidents and disruptions get our clearer label.
      if (ev.c === "trafikkulykke") return ui[lang].category1.trafikkulykke;
      return en ? (POLICE_EN[ev.t] ?? ui.en.category1[ev.c]) : ev.t;
    default:
      return ui[lang].category1[ev.c];
  }
}

/** Secondary line: what the source says, without repeating the type. */
export function detailText(lang: Lang, ev: FeedEvent): string | null {
  if (ev.s === "metalerts" || ev.s === "nve") return lang === "en" && ev.e ? ev.e.su : ev.su;
  if (ev.s === "vegvesen") return [ev.ti, ev.su].filter(Boolean).join(". ").replace(/\.\.+/gu, ".").replace(/\|/gu, " ");
  return ev.su;
}
