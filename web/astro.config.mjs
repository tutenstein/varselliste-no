import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";

// TODO: switch to the real domain once it is registered.
const SITE = process.env.SITE_URL ?? "https://varselliste-no.web.app";

export default defineConfig({
  site: SITE,
  trailingSlash: "always",
  integrations: [
    preact(),
    sitemap({
      i18n: { defaultLocale: "nb", locales: { nb: "nb-NO", en: "en-GB" } },
    }),
  ],
  build: { inlineStylesheets: "auto" },
  vite: {
    // Region data is shared with the Cloud Functions package.
    server: { fs: { allow: [".."] } },
  },
});
