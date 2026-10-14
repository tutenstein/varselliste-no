import type { Category } from "./feed";

/** Category tiles of the incident list, in display order. Warnings have their own band. */
export const LIST_CATEGORIES: Category[] = ["trafikkulykke", "brann", "redning", "trafikk", "kriminalitet", "annet"];

/** Colours live in CSS (`--cat-*`, light and dark); the map needs concrete values. */
export const CATEGORY_HEX: Record<Category, { light: string; dark: string }> = {
  trafikkulykke: { light: "#c2410c", dark: "#fb923c" },
  brann: { light: "#dc2626", dark: "#f87171" },
  redning: { light: "#0e7490", dark: "#22d3ee" },
  trafikk: { light: "#6d28d9", dark: "#a78bfa" },
  kriminalitet: { light: "#a21caf", dark: "#e879f9" },
  annet: { light: "#475569", dark: "#94a3b8" },
  farevarsel: { light: "#a16207", dark: "#facc15" },
  nodvarsel: { light: "#b91c1c", dark: "#fca5a5" },
  vegarbeid: { light: "#64748b", dark: "#94a3b8" },
};

/** Warning levels (MET, NVE): red first. */
export const LEVEL_ORDER: Record<string, number> = { red: 0, orange: 1, yellow: 2 };
