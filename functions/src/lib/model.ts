export type SourceId = "politiloggen" | "vegvesen" | "metalerts" | "nve" | "nodvarsel" | "nrk";

/** Our own taxonomy, shared by every source. */
export type Category =
  | "trafikkulykke" // road traffic accident
  | "brann" // fire
  | "redning" // rescue / other accident (missing person, sea rescue, drowning …)
  | "trafikk" // traffic disruption (obstruction, closure, animals on the road …)
  | "vegarbeid" // roadworks (stored, not shown)
  | "kriminalitet" // crime and public order (shown, like politiet.no)
  | "farevarsel" // weather / flood / landslide warning
  | "nodvarsel" // public emergency alert (cell broadcast)
  | "annet"; // everything else

export type EventStatus = "aktiv" | "avsluttet" | "ukjent";

/** News items (NRK) are shown in their own block, never mixed into the incident list. */
export type EventKind = "hendelse" | "varsel" | "nyhet";

/**
 * How precise `geo` is. Politiloggen only names the kommune, so the UI must never
 * present such a point as the incident location.
 */
export type GeoPrecision = "eksakt" | "omrade" | "kommune" | "fylke" | "mangler";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface NormalizedEvent {
  /** Firestore document id: `${source}-${sourceId}` */
  id: string;
  source: SourceId;
  sourceId: string;
  /** Parent object at the source (Vegvesen situation, MET incident); null if none. */
  groupId: string | null;
  sourceUrl: string | null;
  attribution: string;

  kind: EventKind;
  category: Category;
  /** Original type label or code from the source, e.g. "Brann" or "Accident". */
  subtype: string;
  title: string;
  summary: string | null;
  /** Latest update when the source publishes a thread of messages (Politiloggen). */
  latest: string | null;

  startTime: Date;
  endTime: Date | null;
  publishedAt: Date | null;
  updatedAtSource: Date | null;
  status: EventStatus;
  severity: string | null;

  kommuneNr: string | null;
  kommuneNavn: string | null;
  fylkeNr: string | null;
  fylkeNavn: string | null;
  /** Every kommune / fylke an area warning covers (empty for point incidents). */
  kommuner: string[];
  fylker: string[];
  /** Place within the kommune as published by the source (Politiloggen `area`). */
  place: string | null;
  roadNumber: string | null;

  geo: GeoPoint | null;
  geohash: string | null;
  geoPrecision: GeoPrecision;

  /** English text when the source publishes one (MET, NVE); otherwise null. */
  en: { title: string; summary: string | null } | null;
}

/** Normalized event plus the untouched source payload (stored separately). */
export interface ParsedEvent {
  event: NormalizedEvent;
  raw: unknown;
}

export function eventId(source: SourceId, sourceId: string | number): string {
  return `${source}-${sourceId}`;
}
