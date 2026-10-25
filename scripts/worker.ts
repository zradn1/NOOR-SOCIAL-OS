/**
 * Long-running publishing worker.
 *
 *   pnpm worker
 *
 * Deploy as its own process (Fly.io, Railway, Render, ECS, a VM…), separate
 * from the web app. Several instances can run at once: jobs are claimed with
 * FOR UPDATE SKIP LOCKED. Stops cleanly on SIGINT/SIGTERM after the current
 * batch.
 */
import { hostname } from "node:os";
import { runMaintenance } from "@/server/publishing/maintenance";
import { productionWorkerDeps } from "@/server/publishing/runtime";
import { runPublishingBatch } from "@/server/publishing/worker";
import { getDb } from "@/server/db/client";

const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 15_000);
const MAINTENANCE_EVERY = Math.max(1, Math.round(300_000 / POLL_MS));
const workerId = `${hostname()}-${process.pid}`;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(JSON.stringify({ level: "info", message: "worker.stopping", signal }));
  });
}

async function main() {
  const deps = productionWorkerDeps();
  console.log(JSON.stringify({ level: "info", message: "worker.started", workerId, pollMs: POLL_MS }));
  for (let tick = 0; !stopping; tick++) {
    try {
      const summary = await runPublishingBatch({ workerId, limit: 20, ...deps });
      if (summary.claimed || summary.recovered) console.log(JSON.stringify({ level: "info", message: "worker.batch", ...summary }));
      if (tick % MAINTENANCE_EVERY === 0) await runMaintenance({ keyRing: deps.keyRing! });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "worker.batch_failed", error: (error as Error).message }));
    }
    if (!stopping) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await getDb().destroy();
  console.log(JSON.stringify({ level: "info", message: "worker.stopped" }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
