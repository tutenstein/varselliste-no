// Our own icon set (Varsellisten) (24×24, stroke-based). Rendered statically by Astro or inside islands.
import type { JSX } from "preact";

const PATHS: Record<string, JSX.Element> = {
  trafikkulykke: (
    <>
      <path d="M4.5 12.5 6.2 8a2 2 0 0 1 1.9-1.3h5.3a2 2 0 0 1 1.9 1.3l1.7 4.5" />
      <path d="M3.5 12.5h14v4a1 1 0 0 1-1 1h-1.2m-10.6 0H3.5v-4" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="14" cy="17.5" r="1.6" />
      <path d="m19.5 3.5-.9 2.6M22 7.2l-2.4.6M17 4.6l.4 2" />
    </>
  ),
  brann: (
    <path d="M12 2.8c.8 3.4 5.6 5.6 5.6 10.7a5.6 5.6 0 0 1-11.2 0c0-2.6 1.3-4.3 2.7-5.6.3 1.9 1.1 3 2.5 3.5-.5-3.1.1-5.7.4-8.6Z" />
  ),
  redning: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m5.9 5.9 3.5 3.5m5.2 5.2 3.5 3.5m0-12.2-3.5 3.5m-5.2 5.2-3.5 3.5" />
    </>
  ),
  trafikk: (
    <>
      <path d="M9.6 4h4.8l4.1 14.5H5.5Z" />
      <path d="M8.1 9.4h7.8M6.8 14h10.4M3.5 20.5h17" />
    </>
  ),
  farevarsel: (
    <>
      <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </>
  ),
  kriminalitet: (
    <>
      <path d="M12 2.8 4.5 5.6v5.8c0 4.6 3.1 8.2 7.5 9.8 4.4-1.6 7.5-5.2 7.5-9.8V5.6Z" />
      <path d="M12 7.5v5.2" />
      <circle cx="12" cy="16" r=".6" fill="currentColor" />
    </>
  ),
  annet: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r=".6" fill="currentColor" />
    </>
  ),
  alarm: (
    <>
      <path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5" />
      <path d="M4.5 16.5h15M10 20h4" />
      <path d="M3.2 6.8 5 8M20.8 6.8 19 8M12 2.8v2" />
    </>
  ),
  nodvarsel: (
    <>
      <path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5" />
      <path d="M4.5 16.5h15M10 20h4" />
      <path d="M3.2 6.8 5 8M20.8 6.8 19 8M12 2.8v2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
      <path d="M17.5 13.5v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 3.5 6.6v13l5.5-2.1 6 2.1 5.5-2.1v-13L15 6.6Z" />
      <path d="M9 4.5v13M15 6.6v13" />
    </>
  ),
  road: (
    <>
      <path d="M7.5 3.5 4 20.5M16.5 3.5l3.5 17" />
      <path d="M12 4v3M12 10.5v3M12 17v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  phone: (
    <path d="M7.2 3.5h2.6l1.4 4.1-2 1.5a12 12 0 0 0 5.7 5.7l1.5-2 4.1 1.4v2.6a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 5.2 5.7a2 2 0 0 1 2-2.2Z" />
  ),
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20, class: cls }: { name: string; size?: number; class?: string }) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] ?? PATHS.annet}
    </svg>
  );
}
