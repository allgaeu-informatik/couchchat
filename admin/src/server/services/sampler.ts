import { SAMPLE_INTERVAL_MS, couchchatUrl } from "../config";
import { statsRepo } from "../repositories/stats";
import { fetchSnapshot, type SnapshotResult } from "./couchchat";

export type Fetcher = () => Promise<SnapshotResult>;

interface LiveState {
  result: SnapshotResult | null;
  at: number;
  lastOkAt: number | null;
  /** room list availability of the last successful poll (null = never polled) */
  roomListAvailable: boolean | null;
  inflight: Promise<SnapshotResult> | null;
  timer: ReturnType<typeof setInterval> | null;
  lastReason: string | null;
}

// On globalThis: Next.js may bundle this module into several server chunks (instrumentation vs. route handlers).
const g = globalThis as unknown as { __ccLive?: LiveState };
function state(): LiveState {
  return (g.__ccLive ??= { result: null, at: 0, lastOkAt: null, roomListAvailable: null, inflight: null, timer: null, lastReason: null });
}

/** Test helper. */
export function resetSamplerState(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  g.__ccLive = undefined;
}

export function liveState(): Readonly<Pick<LiveState, "result" | "at" | "lastOkAt" | "roomListAvailable">> {
  return state();
}

/** Fresh poll of CouchChat; also keeps the room sessions ("open since") up to date. Concurrent calls share one request. */
export function poll(now = Date.now(), fetcher: Fetcher = fetchSnapshot): Promise<SnapshotResult> {
  const s = state();
  if (s.inflight) return s.inflight;
  const p = (async () => {
    const r = await fetcher();
    s.result = r;
    s.at = now;
    if (r.ok) {
      s.lastOkAt = now;
      s.roomListAvailable = r.snapshot.roomList !== null;
      if (r.snapshot.roomList) {
        try {
          statsRepo.syncSessions(now, r.snapshot.roomList);
        } catch (e) {
          console.error("stats: room sessions failed:", e instanceof Error ? e.message : "unknown error");
        }
      }
    }
    const reason = r.ok ? "ok" : r.reason;
    if (reason !== s.lastReason) {
      s.lastReason = reason;
      if (reason === "unauthorized") console.warn("[admin] CouchChat-API lehnt COUCHCHAT_API_KEY ab (403). Statistik unvollständig.");
      else if (reason === "unreachable") console.warn("[admin] CouchChat-API nicht erreichbar. Messlücke.");
      else if (reason === "ok") console.log("[admin] CouchChat-API erreichbar.");
    }
    return r;
  })().finally(() => {
    s.inflight = null;
  });
  s.inflight = p;
  return p;
}

/** Cached result for the live view (at most `maxAgeMs` old) so several open browsers do not multiply requests. */
export async function getLive(now = Date.now(), fetcher: Fetcher = fetchSnapshot, maxAgeMs = 5000): Promise<SnapshotResult> {
  const s = state();
  if (s.result && now >= s.at && now - s.at < maxAgeMs) return s.result;
  return poll(now, fetcher);
}

/**
 * One measurement. Reachable: stores (rooms, peers) in the minute slot. Unreachable/unauthorized: stores a GAP (ok=0, NULL values),
 * never a zero. Not configured: stores nothing.
 */
export async function sampleOnce(now = Date.now(), fetcher: Fetcher = fetchSnapshot): Promise<void> {
  const slot = Math.floor(now / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS;
  const r = await poll(now, fetcher);
  if (r.ok) statsRepo.insertSample(slot, true, r.snapshot.rooms, r.snapshot.peers);
  else if (r.reason !== "unconfigured") statsRepo.insertSample(slot, false, null, null);
}

/** Every 60 s (unref'd timer). Only when COUCHCHAT_INTERNAL_URL is set. */
export function startSampler(): void {
  const s = state();
  if (s.timer) return;
  if (!couchchatUrl()) {
    console.log("[admin] COUCHCHAT_INTERNAL_URL nicht gesetzt: keine Nutzungsstatistik.");
    return;
  }
  const tick = () => {
    sampleOnce().catch((e) => console.error("stats sample failed:", e instanceof Error ? e.message : "unknown error"));
  };
  s.timer = setInterval(tick, SAMPLE_INTERVAL_MS);
  s.timer.unref();
  tick();
}
