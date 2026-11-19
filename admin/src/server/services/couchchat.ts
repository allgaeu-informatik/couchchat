import { SAMPLE_TIMEOUT_MS, couchchatApiKey, couchchatUrl } from "../config";
import type { RoomPeers } from "../repositories/stats";

/**
 * Client for the internal CouchChat (MiroTalk) REST API. Privacy rule of the owner: only counts and room names leave this
 * module. Everything else in a response (participant names, join URLs, ...) is dropped here and never logged or stored.
 */
export interface Snapshot {
  rooms: number;
  peers: number;
  /** null = activeRooms not available (endpoint not enabled in CouchChat). */
  roomList: RoomPeers[] | null;
  responseMs: number;
}
export type SnapshotResult = { ok: true; snapshot: Snapshot } | { ok: false; reason: "unconfigured" | "unreachable" | "unauthorized" };
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const META_KEYS = new Set(["lock", "password", "joinLock"]);
const MAX_ROOMS = 500;
const MAX_BODY = 1_000_000;

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** `{ totalRooms, totalPeers }` from /api/v1/stats; every other field is ignored. */
export function sanitizeStats(payload: unknown): { rooms: number; peers: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const rooms = count(p.totalRooms);
  const peers = count(p.totalPeers);
  return rooms === null || peers === null ? null : { rooms, peers };
}

function cleanRoomName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s.length >= 1 && s.length <= 128 ? s : null;
}

/** Number of participants from a number, or from an array/object of peers (counts entries, never reads their content). */
function peerCount(v: unknown): number {
  const n = count(v);
  if (n !== null) return n;
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).filter((k) => !META_KEYS.has(k)).length;
  return 0;
}

/**
 * Room name + participant count from /api/v1/activeRooms (`{ activeRooms: [{ id, peers, join }] }`).
 * Also tolerates the shape of /meetings (`{ meetings: { roomId: { peerId: {...names...} } } }`): only the key and the number
 * of entries are read, so participant names cannot survive. Only { room, peers } is ever returned.
 */
export function sanitizeActiveRooms(payload: unknown): RoomPeers[] | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const out: RoomPeers[] = [];
  const list = p.activeRooms;
  if (Array.isArray(list)) {
    for (const e of list) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      const room = cleanRoomName(o.id ?? o.room);
      if (room) out.push({ room, peers: peerCount(o.peers) });
    }
  } else if (p.meetings && typeof p.meetings === "object") {
    for (const [k, v] of Object.entries(p.meetings as Record<string, unknown>)) {
      const room = cleanRoomName(k);
      if (room) out.push({ room, peers: peerCount(v) });
    }
  } else {
    return null;
  }
  return out.slice(0, MAX_ROOMS);
}

async function getJson(fetchImpl: FetchLike, url: string, key: string): Promise<{ status: number; body: unknown }> {
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { authorization: key, accept: "application/json" },
    signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS),
    redirect: "manual",
    cache: "no-store",
  });
  if (!res.ok) return { status: res.status, body: null };
  const text = await res.text();
  if (text.length > MAX_BODY) return { status: 502, body: null };
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: 502, body: null };
  }
}

/** Fetches /stats (required) and /activeRooms (optional). Never throws, never logs response bodies. */
export async function fetchSnapshot(fetchImpl: FetchLike = fetch): Promise<SnapshotResult> {
  const base = couchchatUrl();
  const key = couchchatApiKey();
  if (!base) return { ok: false, reason: "unconfigured" };
  const t0 = Date.now();
  try {
    const stats = await getJson(fetchImpl, `${base}/api/v1/stats`, key);
    const responseMs = Date.now() - t0;
    if (stats.status === 401 || stats.status === 403) return { ok: false, reason: "unauthorized" };
    const s = sanitizeStats(stats.body);
    if (!s) return { ok: false, reason: "unreachable" };
    let roomList: RoomPeers[] | null = null;
    try {
      const ar = await getJson(fetchImpl, `${base}/api/v1/activeRooms`, key);
      roomList = sanitizeActiveRooms(ar.body);
    } catch {
      roomList = null;
    }
    return { ok: true, snapshot: { rooms: s.rooms, peers: s.peers, roomList, responseMs } };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
