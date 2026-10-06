import { metrics } from "@/server/prometheus";
// Importing db registers the telemetry sink even if no AI call has happened yet.
import "@/server/db";

export const dynamic = "force-dynamic";

/** Prometheus scrape endpoint. Contains aggregate counters only, no code or user data. */
export async function GET() {
  return new Response(await metrics.registry.metrics(), {
    headers: { "Content-Type": metrics.registry.contentType },
  });
}
