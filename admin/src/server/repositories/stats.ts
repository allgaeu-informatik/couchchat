import { getDb, transaction } from "../db/connection";

/** A session whose last sighting is older than this is closed and replaced by a new one. */
const SESSION_STALE_MS = 10 * 60 * 1000;

export interface RoomPeers {
  room: string;
  peers: number;
}

export interface BucketRow {
  b: number;
  maxPeers: number | null;
  avgPeers: number | null;
  maxRooms: number | null;
  okCount: number;
}

export const statsRepo = {
  /** One sample per minute slot (ts is minute-aligned by the caller); a repeated slot replaces the earlier one. */
  insertSample(ts: number, ok: boolean, rooms: number | null, peers: number | null): void {
    getDb().prepare("INSERT OR REPLACE INTO samples (ts, ok, rooms, peers) VALUES (?,?,?,?)").run(ts, ok ? 1 : 0, rooms, peers);
  },

  /**
   * Keeps (room, first_seen, last_seen, max_peers) per open room in sync with the current room list.
   * Rooms that disappeared are closed; new rooms open a session. Only room names and counts are stored.
   */
  syncSessions(now: number, rooms: RoomPeers[]): void {
    transaction(() => {
      const db = getDb();
      const open = db.prepare("SELECT id, room, max_peers, last_seen FROM room_sessions WHERE closed = 0").all() as unknown as {
        id: number;
        room: string;
        max_peers: number;
        last_seen: number;
      }[];
      const byRoom = new Map(open.map((o) => [o.room, o]));
      const seen = new Set<string>();
      const upd = db.prepare("UPDATE room_sessions SET last_seen = ?, max_peers = ? WHERE id = ?");
      const ins = db.prepare("INSERT INTO room_sessions (room, first_seen, last_seen, max_peers) VALUES (?,?,?,?)");
      const close = db.prepare("UPDATE room_sessions SET closed = 1 WHERE id = ?");
      for (const r of rooms) {
        seen.add(r.room);
        const o = byRoom.get(r.room);
        // A session not seen for a long time (gap, panel restart, room list temporarily unavailable) is a different session.
        if (o && now - o.last_seen <= SESSION_STALE_MS) upd.run(now, Math.max(o.max_peers, r.peers), o.id);
        else {
          if (o) close.run(o.id);
          ins.run(r.room, now, now, r.peers);
        }
      }
      for (const o of open) if (!seen.has(o.room)) close.run(o.id);
    });
  },

  openSince(): Map<string, number> {
    const rows = getDb().prepare("SELECT room, first_seen FROM room_sessions WHERE closed = 0").all() as unknown as {
      room: string;
      first_seen: number;
    }[];
    return new Map(rows.map((r) => [r.room, r.first_seen]));
  },

  /** `bucketMs` is interpolated into the SQL: callers pass one of the fixed constants, never user input. */
  aggregate(since: number, bucketMs: number): BucketRow[] {
    if (!Number.isInteger(bucketMs) || bucketMs <= 0) throw new Error("invalid bucket size");
    return getDb()
      .prepare(
        `SELECT (ts / ${bucketMs}) * ${bucketMs} AS b, MAX(peers) AS maxPeers, AVG(peers) AS avgPeers,
                MAX(rooms) AS maxRooms, SUM(ok) AS okCount
           FROM samples WHERE ts >= ? GROUP BY b ORDER BY b`,
      )
      .all(since) as unknown as BucketRow[];
  },

  /** Highest peer count since `since`; ok samples only. */
  /** Timestamp of the oldest stored sample (successful or not), or null if nothing was ever measured. */
  firstSampleTs(): number | null {
    const r = getDb().prepare("SELECT MIN(ts) AS m FROM samples").get() as { m: number | null };
    return r.m ?? null;
  },

  peak(since: number): { peers: number; ts: number } | null {
    const r = getDb()
      .prepare("SELECT peers, ts FROM samples WHERE ts >= ? AND ok = 1 AND peers IS NOT NULL ORDER BY peers DESC, ts DESC LIMIT 1")
      .get(since) as { peers: number; ts: number } | undefined;
    return r ?? null;
  },
  maxRooms(since: number): number {
    const r = getDb().prepare("SELECT MAX(rooms) AS m FROM samples WHERE ts >= ? AND ok = 1").get(since) as { m: number | null };
    return r.m ?? 0;
  },
  /** Sum of peers over all ok samples since `since` (one sample per minute = participant minutes). */
  sumPeers(since: number): number {
    const r = getDb().prepare("SELECT SUM(peers) AS s FROM samples WHERE ts >= ? AND ok = 1").get(since) as { s: number | null };
    return r.s ?? 0;
  },

  purgeOlderThan(ts: number): { samples: number; sessions: number } {
    const db = getDb();
    const samples = Number(db.prepare("DELETE FROM samples WHERE ts < ?").run(ts).changes);
    const sessions = Number(db.prepare("DELETE FROM room_sessions WHERE last_seen < ?").run(ts).changes);
    return { samples, sessions };
  },
};
