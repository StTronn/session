import type { Db } from "@/core/db/db";

/** Record that an event occurrence fired. Returns true if it was newly
 *  recorded (the caller should dispatch), false if it had already fired. */
export function recordOnce(
  db: Db,
  event: string,
  refId: number,
  key: string,
  at: number,
): boolean {
  const info = db.raw
    .query(
      "INSERT OR IGNORE INTO fired_event (event, ref_id, key, fired_at) " +
        "VALUES (?, ?, ?, ?)",
    )
    .run(event, refId, key, at);
  return info.changes > 0;
}

export * as FiredEvent from "./fired-event";
