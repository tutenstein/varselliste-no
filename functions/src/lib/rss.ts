/** Minimal RSS 2.0 reader for the simple feeds we use (NRK, HRS, nodvarsel.no). */
export interface RssItem {
  title: string;
  link: string | null;
  guid: string | null;
  pubDate: string | null;
  /** Atom `a10:updated` / `dc:date` when present. */
  updated: string | null;
  categories: string[];
  description: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
}

function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "u");
  const m = re.exec(xml);
  return m ? decodeXml(m[1]) : null;
}

function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gu");
  return [...xml.matchAll(re)].map((m) => decodeXml(m[1]));
}

export function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gu)].map((m) => {
    const item = m[1];
    return {
      title: tag(item, "title") ?? "",
      link: tag(item, "link"),
      guid: tag(item, "guid"),
      pubDate: tag(item, "pubDate"),
      updated: tag(item, "a10:updated") ?? tag(item, "dc:date"),
      categories: tags(item, "category"),
      description: tag(item, "description"),
    };
  });
}

/** RFC 822 ("Wed, 14 Oct 2026 08:01:34 GMT") or ISO 8601 → Date. */
export function rssDate(item: RssItem): Date | null {
  for (const s of [item.updated, item.pubDate]) {
    if (!s) continue;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
