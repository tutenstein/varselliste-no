import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import { detailText, routes, severityLabel, t, typeLabel, warningLevel, type Lang } from "../i18n";
import { LEVEL_ORDER, LIST_CATEGORIES } from "../lib/categories";
import {
  fetchShard,
  isNews,
  isWarning,
  matchesScope,
  mergeShards,
  parseFeedDoc,
  shardsFor,
  type Category,
  type FeedEvent,
  type FeedShard,
  type Filters,
  type Range,
  type Shard,
} from "../lib/feed";
import { ago, clock, dateTime as fmtDateTime, dayKey, dayLabel, number } from "../lib/format";
import { FYLKE_LIST, fylkeByCode, fylkeName, kommuneByCode, kommuneName } from "../lib/regions";
import Icon from "./Icon";
import type { MapProps } from "./EventMap";

interface Props {
  lang: Lang;
  /** Fixed scope for county / municipality pages. */
  fylke?: string;
  kommune?: string;
}

const PAGE = 50;
const NEWS_PAGE = 6;
const LIVE_REFRESH_MS = 60_000;
const OLDER_REFRESH_MS = 10 * 60_000;
const RADII = [5, 10, 25, 50, 100];

declare global {
  interface Window {
    __vlLive?: Promise<unknown>;
  }
}

type LoadState = "loading" | "ok" | "error";
type GeoState = "idle" | "locating" | "denied" | "unsupported";

function readUrl(scoped: boolean): Partial<Filters> {
  if (typeof location === "undefined") return {};
  const p = new URLSearchParams(location.search);
  const range = p.get("t");
  const cats = (p.get("c") ?? "").split(",").filter((c): c is Category => (LIST_CATEGORIES as string[]).includes(c));
  const fylke = p.get("fylke");
  return {
    range: range === "7d" || range === "30d" || range === "24h" ? range : undefined,
    categories: new Set(cats),
    fylke: !scoped && fylke && fylkeByCode.has(fylke) ? fylke : null,
    q: p.get("q") ?? "",
  };
}

function writeUrl(f: Filters, scoped: boolean) {
  const p = new URLSearchParams();
  if (f.range !== "24h") p.set("t", f.range);
  if (f.categories.size) p.set("c", [...f.categories].join(","));
  if (!scoped && f.fylke) p.set("fylke", f.fylke);
  if (f.q) p.set("q", f.q);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

export default function LiveFeed({ lang, fylke, kommune }: Props) {
  const tr = t(lang);
  const scoped = Boolean(fylke || kommune);

  const [shards, setShards] = useState<Partial<Record<Shard, FeedShard & { fetchedAt: number }>>>({});
  const [load, setLoad] = useState<LoadState>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState<Range>("24h");
  const [categories, setCategories] = useState<Set<Category>>(new Set());
  const [fylkeFilter, setFylkeFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [geo, setGeo] = useState<GeoState>("idle");
  const [limit, setLimit] = useState(PAGE);
  const [newsLimit, setNewsLimit] = useState(NEWS_PAGE);
  const [showMap, setShowMap] = useState(false);
  const [MapView, setMapView] = useState<ComponentType<MapProps> | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const hydrated = useRef(false);

  // ---- initial state from the URL
  useEffect(() => {
    const u = readUrl(scoped);
    if (u.range) setRange(u.range);
    if (u.categories?.size) setCategories(u.categories);
    if (u.fylke) setFylkeFilter(u.fylke);
    if (u.q) setQ(u.q);
    hydrated.current = true;
    // Desktop shows the map by default; phones open it on demand.
    if (window.matchMedia("(min-width: 1100px)").matches) setShowMap(true);
  }, []);

  useEffect(() => {
    if (hydrated.current) writeUrl({ range, categories, fylke: fylkeFilter, kommune: null, q, near: null }, scoped);
  }, [range, categories, fylkeFilter, q]);

  // ---- data loading
  async function loadShard(shard: Shard) {
    try {
      // The layout starts fetching feeds/live in <head>, before this island hydrates.
      const early = shard === "live" ? window.__vlLive : undefined;
      window.__vlLive = undefined;
      const data = await fetchShard(shard, early?.then((doc) => parseFeedDoc(doc as Parameters<typeof parseFeedDoc>[0])));
      setShards((s) => ({ ...s, [shard]: { ...data, fetchedAt: Date.now() } }));
      setLoad("ok");
    } catch {
      setLoad((l) => (l === "ok" ? "ok" : "error"));
    }
  }

  useEffect(() => {
    void loadShard("live");
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") void loadShard("live");
    }, LIVE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void loadShard("live");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    for (const shard of shardsFor(range)) {
      if (shard === "live") continue;
      const have = shards[shard];
      if (!have || Date.now() - have.fetchedAt > OLDER_REFRESH_MS) void loadShard(shard);
    }
  }, [range]);

  // ---- map (loaded lazily, only when shown)
  useEffect(() => {
    // Wait for the list first: the map bundle is large and must not delay the incidents.
    if (showMap && !MapView && load !== "loading") void import("./EventMap").then((m) => setMapView(() => m.default));
  }, [showMap, load]);

  // ---- derived data
  const filters: Filters = {
    range,
    categories,
    fylke: fylke ?? fylkeFilter,
    kommune: kommune ?? null,
    q,
    near: near ? { ...near, km: radius } : null,
  };

  const searchText = (ev: FeedEvent) =>
    [ev.t, typeLabel("nb", ev), typeLabel("en", ev), ev.ti, ev.su, ev.la, ev.e?.ti, kommuneName(ev.k), ev.pl, fylkeName(ev.f), ev.r]
      .filter(Boolean)
      .join(" ");

  const all = useMemo(
    () => mergeShards(shardsFor(range).map((s) => shards[s]).filter((s): s is FeedShard & { fetchedAt: number } => !!s)),
    [shards, range],
  );

  const scopedEvents = useMemo(
    () => all.filter((ev) => matchesScope(ev, filters, now, searchText)),
    [all, range, fylke, kommune, fylkeFilter, q, near, radius, now],
  );

  const incidents = useMemo(() => scopedEvents.filter((ev) => !isWarning(ev) && !isNews(ev)), [scopedEvents]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ev of incidents) c[ev.c] = (c[ev.c] ?? 0) + 1;
    return c;
  }, [incidents]);

  const alerts = useMemo(() => scopedEvents.filter((ev) => ev.c === "nodvarsel" && ev.x === "aktiv"), [scopedEvents]);

  const warnings = useMemo(
    () =>
      scopedEvents
        .filter((ev) => ev.c === "farevarsel" && ev.x === "aktiv")
        .sort((a, b) => (LEVEL_ORDER[a.sv ?? ""] ?? 9) - (LEVEL_ORDER[b.sv ?? ""] ?? 9) || a.st - b.st),
    [scopedEvents],
  );

  // News: only items placed in this kommune on a kommune page (fylke-level headlines are too broad).
  const news = useMemo(
    () => scopedEvents.filter((ev) => isNews(ev) && (!kommune || ev.k === kommune)),
    [scopedEvents, kommune],
  );

  const list = useMemo(
    () => incidents.filter((ev) => (categories.size ? categories.has(ev.c) : LIST_CATEGORIES.includes(ev.c))),
    [incidents, categories],
  );

  const groups = useMemo(() => {
    const out: { key: string; events: FeedEvent[] }[] = [];
    for (const ev of list.slice(0, limit)) {
      const key = dayKey(ev.st);
      const last = out[out.length - 1];
      if (last?.key === key) last.events.push(ev);
      else out.push({ key, events: [ev] });
    }
    return out;
  }, [list, limit]);

  const placeIsKommune = scoped || !!filters.fylke;
  const stats = useMemo(() => {
    const types = new Map<string, number>();
    const places = new Map<string, number>();
    for (const ev of list) {
      const label = typeLabel(lang, ev);
      types.set(label, (types.get(label) ?? 0) + 1);
      const place = placeIsKommune ? ev.k : ev.f;
      if (place) places.set(place, (places.get(place) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { types: top(types), places: top(places) };
  }, [list, lang, placeIsKommune]);

  const generatedAt = shards.live?.generatedAt ?? null;
  const filtersActive = categories.size > 0 || !!fylkeFilter || !!q || !!near;

  // ---- actions
  function toggleCategory(c: Category) {
    setLimit(PAGE);
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function locate() {
    if (near) {
      setNear(null);
      setGeo("idle");
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeo("unsupported");
      return;
    }
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~100 m: precise enough for a radius filter, never stored or sent anywhere.
        setNear({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 });
        setGeo("idle");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  function clearFilters() {
    setCategories(new Set());
    setFylkeFilter(null);
    setQ("");
    setNear(null);
    setGeo("idle");
    setLimit(PAGE);
  }

  function selectFromMap(id: string) {
    setSelected(id);
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= limit) setLimit(idx + 10);
    requestAnimationFrame(() => document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const mapEvents = useMemo(() => [...list.slice(0, 400), ...(categories.size ? [] : warnings)], [list, warnings, categories]);

  // ---- render
  return (
    <div class="feed">
      <div class="feed-status" aria-live="polite">
        <span class={`live-dot ${load === "ok" ? "is-live" : ""}`} aria-hidden="true" />
        <span class="live-label">{tr.live}</span>
        {generatedAt && (
          <span class="muted">
            · {tr.updated} {clock(lang, generatedAt)}
          </span>
        )}
      </div>

      {alerts.length > 0 && (
        <section class="alerts" aria-label={tr.nodvarselTitle}>
          {alerts.map((a) => (
            <div class="alert" key={a.id}>
              <Icon name="alarm" size={22} />
              <div>
                <p class="alert-head">
                  <strong>{tr.nodvarselTitle}:</strong> {a.ti}
                  <span class="muted"> · {clock(lang, a.st)}{a.k ? ` · ${kommuneName(a.k)}` : ""}</span>
                </p>
                <p class="alert-note">
                  {tr.nodvarselNote}{" "}
                  <a href={a.u ?? "https://www.nodvarsel.no/"} target="_blank" rel="noopener">
                    {tr.nodvarselLink}
                  </a>
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      <div class="tiles" role="group" aria-label={tr.categoriesLabel}>
        {LIST_CATEGORIES.map((c) => (
          <button
            type="button"
            class={`tile ${categories.has(c) ? "is-on" : ""}`}
            data-c={c}
            aria-pressed={categories.has(c)}
            onClick={() => toggleCategory(c)}
          >
            <span class="tile-icon">
              <Icon name={c} size={22} />
            </span>
            <span class="tile-count">{load === "loading" ? "–" : number(lang, counts[c] ?? 0)}</span>
            <span class="tile-label">{tr.categories[c]}</span>
          </button>
        ))}
      </div>

      <div class="toolbar">
        <div class="segmented" role="radiogroup" aria-label={tr.rangeLabel}>
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              type="button"
              role="radio"
              aria-checked={range === r}
              class={range === r ? "is-on" : ""}
              onClick={() => {
                setRange(r);
                setLimit(PAGE);
              }}
            >
              <span class="only-wide">{tr.range[r]}</span>
              <span class="only-narrow">{tr.rangeShort[r]}</span>
            </button>
          ))}
        </div>

        <label class="search">
          <Icon name="search" size={18} />
          <span class="sr-only">{tr.search}</span>
          <input
            type="search"
            value={q}
            placeholder={tr.searchPlaceholder}
            onInput={(e) => {
              setQ((e.target as HTMLInputElement).value);
              setLimit(PAGE);
            }}
          />
        </label>

        {!scoped && (
          <label class="select">
            <span class="sr-only">{tr.county}</span>
            <select
              value={fylkeFilter ?? ""}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                setFylkeFilter(v || null);
                setLimit(PAGE);
              }}
            >
              <option value="">{tr.allNorway}</option>
              {FYLKE_LIST.map((f) => (
                <option value={f.code}>{f.name}</option>
              ))}
            </select>
          </label>
        )}

        <div class="near">
          <button type="button" class={`btn ${near ? "is-on" : ""}`} onClick={locate} aria-pressed={!!near}>
            <Icon name="locate" size={18} />
            <span>{geo === "locating" ? tr.locating : near ? tr.nearMeActive(radius) : tr.nearMe}</span>
            {near && <Icon name="close" size={14} />}
          </button>
          {near && (
            <select class="radius" value={radius} aria-label={tr.distance} onChange={(e) => setRadius(Number((e.target as HTMLSelectElement).value))}>
              {RADII.map((r) => (
                <option value={r}>{r} km</option>
              ))}
            </select>
          )}
        </div>

        <button type="button" class="btn map-toggle" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
          <Icon name="map" size={18} />
          <span>{showMap ? tr.map.hide : tr.map.show}</span>
        </button>
      </div>

      {(geo === "denied" || geo === "unsupported") && <p class="notice">{geo === "denied" ? tr.geoDenied : tr.geoUnsupported}</p>}
      {near && <p class="hint">{tr.geoNote}</p>}

      {warnings.length > 0 && (
        <section class="warnings" aria-label={tr.warningsTitle}>
          <div class="warnings-head">
            <Icon name="farevarsel" size={20} />
            <h2>{tr.warningsTitle}</h2>
            <span class="muted">{tr.warningsCount(warnings.length)}</span>
          </div>
          <ul>
            {(warningsOpen ? warnings : warnings.slice(0, 3)).map((w) => (
              <li class="warning" data-level={w.sv ?? ""}>
                <span class="level">{warningLevel(lang, w.sv) ?? tr.category1.farevarsel}</span>
                <a class="warning-title" href={w.u ?? undefined} target="_blank" rel="noopener">
                  {typeLabel(lang, w)}
                </a>
                {w.en && (
                  <span class="muted warning-until">
                    {tr.until} {fmtDateTime(lang, w.en)} · {tr.sources[w.s]}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {warnings.length > 3 && (
            <button type="button" class="link-btn" onClick={() => setWarningsOpen((v) => !v)}>
              {warningsOpen ? tr.hide : `${tr.showAll} (${warnings.length})`}
            </button>
          )}
        </section>
      )}

      <div class={`feed-grid ${showMap ? "with-map" : ""}`}>
        <section class="feed-list" aria-label={tr.nav.events}>
          <div class="list-head">
            <strong>{load === "loading" ? tr.loading : tr.results(list.length)}</strong>
            {filtersActive && (
              <button type="button" class="link-btn" onClick={clearFilters}>
                {tr.clearFilters}
              </button>
            )}
          </div>
          {lang === "en" && <p class="hint">{tr.dataInNorwegian}</p>}

          {load === "loading" && <Skeleton />}
          {load === "error" && (
            <p class="notice">
              {tr.loadError}{" "}
              <button type="button" class="link-btn" onClick={() => void loadShard("live")}>
                {tr.retry}
              </button>
            </p>
          )}
          {load === "ok" && list.length === 0 && <p class="empty">{tr.noResults}</p>}

          {groups.map((g) => (
            <div class="day" key={g.key}>
              <h2 class="day-label">{dayLabel(lang, g.key, now)}</h2>
              <ol class="events">
                {g.events.map((ev) => (
                  <EventItem ev={ev} lang={lang} now={now} selected={selected === ev.id} key={ev.id} />
                ))}
              </ol>
            </div>
          ))}

          {list.length > limit && (
            <button type="button" class="btn more" onClick={() => setLimit((l) => l + PAGE)}>
              {tr.showMore} ({number(lang, list.length - limit)})
            </button>
          )}
        </section>

        <aside class="feed-side">
          {showMap && (
            <div class="card map-card">
              {MapView ? (
                <MapView lang={lang} events={mapEvents} near={filters.near} onSelect={selectFromMap} fitTo={scoped} />
              ) : (
                <div class="map-placeholder" />
              )}
              <p class="hint">{tr.map.approx}</p>
            </div>
          )}

          {load === "ok" && stats.types.length > 0 && (
            <div class="card">
              <h2 class="card-title">{tr.stats.topTypes}</h2>
              <Bars rows={stats.types.map(([label, n]) => ({ label, n }))} lang={lang} />
            </div>
          )}
          {load === "ok" && stats.places.length > 1 && (
            <div class="card">
              <h2 class="card-title">{tr.stats.topPlaces}</h2>
              <Bars
                lang={lang}
                rows={stats.places.map(([code, n]) => {
                  const k = placeIsKommune ? kommuneByCode.get(code) : null;
                  const f = placeIsKommune ? null : fylkeByCode.get(code);
                  return {
                    label: k?.name ?? f?.name ?? code,
                    href: k ? routes.kommune(lang, k.slug) : f ? routes.fylke(lang, f.slug) : undefined,
                    n,
                  };
                })}
              />
            </div>
          )}
        </aside>
      </div>

      {news.length > 0 && (
        <section class="news card" aria-labelledby="news-title">
          <h2 class="card-title" id="news-title">
            {tr.newsTitle}
          </h2>
          <p class="hint">{tr.newsNote}</p>
          <ul class="news-list">
            {news.slice(0, newsLimit).map((n) => (
              <li key={n.id}>
                <a href={n.u ?? undefined} target="_blank" rel="noopener" lang="nb">
                  {n.ti}
                </a>
                <span class="muted small">
                  {tr.newsFrom[n.s]} · {ago(lang, n.st, now)}
                  {kommuneName(n.k) || fylkeName(n.f) ? ` · ${kommuneName(n.k) ?? fylkeName(n.f)}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {news.length > newsLimit && (
            <button type="button" class="link-btn" onClick={() => setNewsLimit((l) => l + 12)}>
              {tr.showMore} ({number(lang, news.length - newsLimit)})
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function EventItem({ ev, lang, now, selected }: { ev: FeedEvent; lang: Lang; now: number; selected: boolean }) {
  const tr = t(lang);
  const [open, setOpen] = useState(false);
  const kommune = ev.k ? kommuneByCode.get(ev.k) : null;
  const fylke = ev.f ? fylkeByCode.get(ev.f) : kommune ? fylkeByCode.get(kommune.fylke) : null;
  const detail = detailText(lang, ev);
  const status = ev.x === "aktiv" ? tr.ongoing : ev.x === "avsluttet" ? tr.ended : null;
  const severity = severityLabel(lang, ev);

  return (
    <li id={`ev-${ev.id}`} class={`ev ${selected ? "is-selected" : ""} ${open ? "is-open" : ""}`} data-c={ev.c}>
      <span class="ev-icon" aria-hidden="true">
        <Icon name={ev.c} size={20} />
      </span>
      <div class="ev-body">
        <div class="ev-head">
          <h3 class="ev-type">{typeLabel(lang, ev)}</h3>
          {ev.r && (
            <span class="chip road">
              <Icon name="road" size={13} />
              {ev.r}
            </span>
          )}
          {severity && <span class={`chip sev ${/highest|red|orange/u.test(ev.sv ?? "") ? "is-high" : ""}`}>{severity}</span>}
          {status && <span class={`chip status ${ev.x === "aktiv" ? "is-active" : ""}`}>{status}</span>}
        </div>
        <div class="ev-meta">
          <time datetime={new Date(ev.st).toISOString()} title={fmtDateTime(lang, ev.st)}>
            {clock(lang, ev.st)}
          </time>
          <span class="dot" aria-hidden="true">
            ·
          </span>
          <span>{ago(lang, ev.st, now)}</span>
          {(kommune || fylke) && (
            <span class="dot" aria-hidden="true">
              ·
            </span>
          )}
          {(kommune || fylke) && (
            <span class="place">
              {kommune && <a href={routes.kommune(lang, kommune.slug)}>{kommune.name}</a>}
              {kommune && ev.pl && <span>, {ev.pl}</span>}
              {kommune && fylke && <span class="muted">, </span>}
              {fylke && (
                <a class={kommune ? "muted" : ""} href={routes.fylke(lang, fylke.slug)}>
                  {fylke.name}
                </a>
              )}
              {ev.gp === "kommune" && (
                <span class="approx" title={tr.approxLocation} aria-label={tr.approxLocation}>
                  {" "}
                  ≈
                </span>
              )}
            </span>
          )}
        </div>
        {detail && (
          <p class="ev-text" lang="nb" onClick={() => setOpen((o) => !o)}>
            {detail}
          </p>
        )}
        {ev.la && (
          <p class="ev-text ev-latest" lang="nb" onClick={() => setOpen((o) => !o)}>
            <strong lang={lang}>{tr.latest}:</strong> {ev.la}
          </p>
        )}
        {ev.u ? (
          <a class="ev-source" href={ev.u} target="_blank" rel="noopener nofollow">
            {tr.source}: {tr.sources[ev.s] ?? ev.s}
            <Icon name="external" size={13} />
          </a>
        ) : (
          <span class="ev-source muted">
            {tr.source}: {tr.sources[ev.s] ?? ev.s}
          </span>
        )}
      </div>
    </li>
  );
}

function Bars({ rows, lang }: { rows: { label: string; n: number; href?: string }[]; lang: Lang }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul class="bars">
      {rows.map((r) => (
        <li>
          <div class="bar-label">
            {r.href ? <a href={r.href}>{r.label}</a> : <span>{r.label}</span>}
            <span class="bar-n">{number(lang, r.n)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <ol class="events skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(() => (
        <li class="ev">
          <span class="ev-icon" />
          <div class="ev-body">
            <span class="sk sk-title" />
            <span class="sk sk-line" />
            <span class="sk sk-line short" />
          </div>
        </li>
      ))}
    </ol>
  );
}

