import type { Lang } from "../i18n";
import { ui } from "../i18n";

const TZ = "Europe/Oslo";
const locale = (lang: Lang) => (lang === "nb" ? "nb-NO" : "en-GB");

const timeFmt = new Map<Lang, Intl.DateTimeFormat>();
export function clock(lang: Lang, ms: number): string {
  let f = timeFmt.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    timeFmt.set(lang, f);
  }
  return f.format(ms);
}

const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ });
/** Norwegian calendar date, "YYYY-MM-DD". */
export const dayKey = (ms: number) => dayKeyFmt.format(ms);

export function dayLabel(lang: Lang, key: string, now: number): string {
  if (key === dayKey(now)) return ui[lang].today;
  if (key === dayKey(now - 86400_000)) return ui[lang].yesterday;
  const [y, m, d] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat(locale(lang), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    Date.UTC(y, m - 1, d),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dateTime(lang: Lang, ms: number): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);
}

export function ago(lang: Lang, ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return ui[lang].ago.now;
  if (min < 60) return ui[lang].ago.min(min);
  const h = Math.floor(min / 60);
  if (h < 24) return ui[lang].ago.h(h);
  return dateTime(lang, ms);
}

export function number(lang: Lang, n: number, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}
