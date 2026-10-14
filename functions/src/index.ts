import { logger, setGlobalOptions } from "firebase-functions";
import { onSchedule } from "firebase-functions/scheduler";
import { runPublishJob } from "./feeds";
import {
  closeExpiredEvents,
  runHrsJob,
  runMetAlertsJob,
  runNodvarselJob,
  runNrkJob,
  runNveJob,
  runPolitiloggenJob,
  runVegvesenJob,
} from "./jobs";
import { runIngest } from "./lib/store";
import { TIME_ZONE } from "./lib/time";
import { POLITILOGGEN_ATTRIBUTION } from "./sources/politiloggen";
import { VEGVESEN_ATTRIBUTION } from "./sources/vegvesen";
import { METALERTS_ATTRIBUTION } from "./sources/metalerts";
import { NVE_ATTRIBUTION } from "./sources/nve";
import { NODVARSEL_ATTRIBUTION } from "./sources/nodvarsel";
import { HRS_ATTRIBUTION, NRK_ATTRIBUTION } from "./sources/news";

// Cloud Scheduler is not available in europe-north1 (nor europe-north2), and Norway has no
// Google Cloud region, so the functions run in europe-west1; Firestore (the data) lives in
// europe-north1. See docs/veri-kaynaklari.md §7.
export const REGION = "europe-west1";

setGlobalOptions({ region: REGION, maxInstances: 1, memory: "256MiB" });

const every = (minutes: number, timeoutSeconds: number, memory: "256MiB" | "512MiB" = "256MiB") => ({
  schedule: `every ${minutes} minutes`,
  timeZone: TIME_ZONE,
  timeoutSeconds,
  memory,
  retryCount: 0,
});

// No documented rate limit; 1 call per run (+1 for the backfill, 5 s apart).
export const ingestPolitiloggen = onSchedule(every(3, 120, "512MiB"), () =>
  runIngest("politiloggen", POLITILOGGEN_ATTRIBUTION, () => runPolitiloggenJob()),
);

// Delta of the last ~2 minutes; an id-only snapshot every 30 minutes.
export const ingestVegvesen = onSchedule(every(2, 180, "512MiB"), () =>
  runIngest("vegvesen", VEGVESEN_ATTRIBUTION, () => runVegvesenJob()),
);

// MET's terms: alerts no more often than every 10 minutes, with If-Modified-Since.
export const ingestMetAlerts = onSchedule(every(10, 60), () =>
  runIngest("metalerts", METALERTS_ATTRIBUTION, () => runMetAlertsJob()),
);

// Warnings are issued daily (more often during events).
export const ingestNve = onSchedule(every(30, 60), () => runIngest("nve", NVE_ATTRIBUTION, () => runNveJob()));

// Emergency alerts: as fresh as possible.
export const ingestNodvarsel = onSchedule(every(2, 60), () =>
  runIngest("nodvarsel", NODVARSEL_ATTRIBUTION, () => runNodvarselJob()),
);

// News headlines: 12 NRK district feeds + Hovedredningssentralen.
export const ingestNews = onSchedule(every(15, 120), async () => {
  await runIngest("nrk", NRK_ATTRIBUTION, () => runNrkJob());
  await runIngest("hrs", HRS_ATTRIBUTION, () => runHrsJob());
});

export const closeExpired = onSchedule(every(30, 120), async () => {
  const closed = await closeExpiredEvents();
  logger.info("closeExpired", { closed });
});

// Builds the compact public feeds the website reads (see feeds.ts).
export const publishFeeds = onSchedule(every(2, 120, "512MiB"), async () => {
  const stats = await runPublishJob();
  logger.info("publishFeeds", stats);
});
