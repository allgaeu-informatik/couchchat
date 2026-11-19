import { statfsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import pkg from "../../../package.json";
import { STATS_RETENTION_MS, couchchatImage, couchchatUrl, dataDir, turnHost, turnPort } from "../config";
import { statsRepo, type BucketRow } from "../repositories/stats";
import { usersRepo } from "../repositories/users";
import { isLegacyHash } from "../security/password";
import type { HistoryBucket, LinkStatus, LiveRoom, StatsHistory, StatsOverview, StatsRange, SystemInfo } from "../types";
import { getLive, liveState, type Fetcher } from "./sampler";
import { hostSyncStatus } from "./hostSync";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Range -> window and bucket size: 24h in 15 min, 7d in 1 h, 30d in 6 h. */
export const RANGES: Record<StatsRange, { windowMs: number; bucketMs: number }> = {
  "24h": { windowMs: DAY, bucketMs: 15 * MIN },
  "7d": { windowMs: 7 * DAY, bucketMs: HOUR },
  "30d": { windowMs: 30 * DAY, bucketMs: 6 * HOUR },
};

/**
 * Pure: turns the aggregated rows into a gapless list of buckets. Buckets without any successful measurement are
 * marked as gap (values null, not 0). Buckets that end before the very first sample (measurement had not started yet)
 * are "no data" (values null, gap false), so a fresh installation is not shown as one long outage.
 */
export function fillBuckets(rows: BucketRow[], from: number, to: number, bucketMs: number, firstSampleTs?: number | null): HistoryBucket[] {
  const byTs = new Map(rows.map((r) => [r.b, r]));
  const out: HistoryBucket[] = [];
  for (let t = Math.floor(from / bucketMs) * bucketMs; t <= to; t += bucketMs) {
    const r = byTs.get(t);
    if (!r && firstSampleTs !== undefined && (firstSampleTs === null || t + bucketMs <= firstSampleTs)) {
      out.push({ ts: t, maxPeers: null, avgPeers: null, maxRooms: null, gap: false });
    } else if (!r || !r.okCount) {
      out.push({ ts: t, maxPeers: null, avgPeers: null, maxRooms: null, gap: true });
    } else {
      out.push({
        ts: t,
        maxPeers: r.maxPeers ?? 0,
        avgPeers: Math.round((r.avgPeers ?? 0) * 100) / 100,
        maxRooms: r.maxRooms ?? 0,
        gap: false,
      });
    }
  }
  return out;
}

export function getHistory(range: StatsRange, now = Date.now()): StatsHistory {
  const { windowMs, bucketMs } = RANGES[range];
  const from = now - windowMs;
  const buckets = fillBuckets(statsRepo.aggregate(from, bucketMs), from, now, bucketMs, statsRepo.firstSampleTs());
  const peak = statsRepo.peak(from);
  return {
    range,
    bucketMs,
    from,
    to: now,
    buckets,
    peakPeers: peak?.peers ?? 0,
    peakRooms: statsRepo.maxRooms(from),
    peakAt: peak && peak.peers > 0 ? new Date(peak.ts).toISOString() : null,
  };
}

/** Deletes samples and room sessions older than 30 days (hourly maintenance). */
export function purgeStats(now = Date.now()): { samples: number; sessions: number } {
  return statsRepo.purgeOlderThan(now - STATS_RETENTION_MS);
}

// --- system info ---

interface TurnCache {
  at: number;
  reachable: boolean;
}
const tg = globalThis as unknown as { __ccTurn?: TurnCache };

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

/** TCP reachability of the TURN server (timeout 2 s, cached for 30 s). null when TURN_HOST is not set. */
export async function checkTurn(now = Date.now()): Promise<{ reachable: boolean } | null> {
  const host = turnHost();
  if (!host) return null;
  const c = tg.__ccTurn;
  if (c && now - c.at < 30_000 && now >= c.at) return { reachable: c.reachable };
  const reachable = await tcpConnect(host, turnPort(), 2000);
  tg.__ccTurn = { at: now, reachable };
  return { reachable };
}

export function resetTurnCache(): void {
  tg.__ccTurn = undefined;
}

function diskInfo(): { diskFree: number | null; diskTotal: number | null } {
  try {
    const s = statfsSync(dataDir());
    return { diskFree: Number(s.bavail) * Number(s.bsize), diskTotal: Number(s.blocks) * Number(s.bsize) };
  } catch {
    return { diskFree: null, diskTotal: null };
  }
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export async function getSystemInfo(status: LinkStatus, responseMs: number | null): Promise<SystemInfo> {
  const live = liveState();
  const users = usersRepo.list();
  const hs = hostSyncStatus();
  const la = os.loadavg();
  return {
    couchchat: {
      status,
      responseMs,
      lastOkAt: iso(live.lastOkAt),
      image: couchchatImage(),
      roomListAvailable: live.roomListAvailable,
    },
    panel: { version: pkg.version, uptimeSeconds: Math.round(process.uptime()) },
    host: {
      load: [la[0] ?? 0, la[1] ?? 0, la[2] ?? 0].map((x) => Math.round(x * 100) / 100) as [number, number, number],
      memTotal: os.totalmem(),
      memFree: os.freemem(),
      ...diskInfo(),
    },
    turn: await checkTurn(),
    hostSync: { ok: hs.ok, lastSuccessAt: iso(hs.lastSuccessAt) },
    users: {
      total: users.length,
      active: users.filter((u) => u.active === 1).length,
      admins: users.filter((u) => u.role === "admin" && u.active === 1).length,
      legacyPasswords: users.filter((u) => isLegacyHash(u.password_hash)).length,
    },
  };
}

// --- overview ---

export async function getOverview(now = Date.now(), fetcher?: Fetcher): Promise<StatsOverview> {
  const r = await getLive(now, fetcher);
  let status: LinkStatus = "unreachable";
  let rooms: number | null = null;
  let peers: number | null = null;
  let roomList: LiveRoom[] | null = null;
  let responseMs: number | null = null;
  if (r.ok) {
    status = "ok";
    rooms = r.snapshot.rooms;
    peers = r.snapshot.peers;
    responseMs = r.snapshot.responseMs;
    if (r.snapshot.roomList) {
      const since = statsRepo.openSince();
      roomList = r.snapshot.roomList
        .map((x) => ({ room: x.room, peers: x.peers, openSince: iso(since.get(x.room) ?? null) }))
        .sort((a, b) => b.peers - a.peers || a.room.localeCompare(b.room));
    }
  } else if (r.reason === "unconfigured" || !couchchatUrl()) {
    status = "unconfigured";
  }
  const sampledAt = liveState().at;
  return {
    live: { status, rooms, peers, roomList, sampledAt: sampledAt ? new Date(sampledAt).toISOString() : null },
    tiles: {
      activeRooms: rooms,
      peersNow: peers,
      peak24h: statsRepo.peak(now - DAY)?.peers ?? 0,
      // Teilnehmer-Minuten = sum of the participant counts of all successful per-minute samples (gaps count as 0 minutes).
      participantMinutes7d: statsRepo.sumPeers(now - 7 * DAY),
    },
    system: await getSystemInfo(status, responseMs),
  };
}
