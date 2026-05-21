import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { detectEvents } from "@/core/daemon/detect";
import { FiredEvent } from "@/core/daemon/fired-event";
import { Hooks } from "@/core/hooks/hooks";

export interface TickOptions {
  hooksDir: string;
  dataDir: string;
}

/** One daemon cycle: detect time-based events, dedup against `fired_event`,
 *  and dispatch the newly-recorded ones. */
export async function tick(
  db: Db,
  clock: Clock,
  opts: TickOptions,
): Promise<void> {
  for (const d of detectEvents(db, clock)) {
    const isNew = FiredEvent.recordOnce(
      db,
      d.payload.event,
      d.ref_id,
      d.dedup_key,
      clock.now(),
    );
    if (!isNew) continue;
    await Hooks.dispatch(d.payload, {
      hooksDir: opts.hooksDir,
      dataDir: opts.dataDir,
      timeoutMs: 10000,
      log: "daemon",
    });
  }
}

export * as Daemon from "./daemon";
