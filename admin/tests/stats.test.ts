import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as historyGET } from "@/app/api/stats/history/route";
import { GET as overviewGET } from "@/app/api/stats/overview/route";
import { statsRepo } from "@/server/repositories/stats";
import { usersRepo } from "@/server/repositories/users";
import { hashPassword } from "@/server/security/password";
import { login } from "@/server/services/auth";
import { fetchSnapshot, sanitizeActiveRooms, sanitizeStats, type FetchLike, type SnapshotResult } from "@/server/services/couchchat";
import { poll, resetSamplerState, sampleOnce } from "@/server/services/sampler";
import { fillBuckets, getHistory, getOverview, purgeStats, RANGES, resetTurnCache } from "@/server/services/stats";
import { freshEnv, meta } from "./helpers";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// minute-aligned and aligned to every bucket size (15 min, 1 h, 6 h)
const T0 = Math.floor(Date.UTC(2026, 5, 15, 12, 0, 0) / (6 * HOUR)) * 6 * HOUR;

const okResult = (rooms: number, peers: number, roomList: { room: string; peers: number }[] | null = []): SnapshotResult => ({
  ok: true,
  snapshot: { rooms, peers, roomList, responseMs: 5 },
});

describe("statistics", () => {
  let env: ReturnType<typeof freshEnv>;
  beforeEach(() => {
    env = freshEnv();
    resetSamplerState();
    resetTurnCache();
    delete process.env.TURN_HOST;
    process.env.COUCHCHAT_INTERNAL_URL = "http://couchchat:3000";
    process.env.COUCHCHAT_API_KEY = "test-key";
  });
  afterEach(() => {
    resetSamplerState();
    delete process.env.COUCHCHAT_INTERNAL_URL;
    delete process.env.COUCHCHAT_API_KEY;
    env.cleanup();
  });

  describe("bucketing and aggregation", () => {
    it("uses 15 min / 1 h / 6 h buckets for 24h / 7d / 30d", () => {
      expect(RANGES["24h"].bucketMs).toBe(15 * MIN);
      expect(RANGES["7d"].bucketMs).toBe(HOUR);
      expect(RANGES["30d"].bucketMs).toBe(6 * HOUR);
    });

    it("computes max and average per bucket and marks buckets without data as gap", () => {
      const now = T0 + 3 * HOUR;
      // bucket T0+2h (15 min): peers 2, 6, 4 -> max 6, avg 4; rooms max 3
      statsRepo.insertSample(now - HOUR + 0 * MIN, true, 1, 2);
      statsRepo.insertSample(now - HOUR + 1 * MIN, true, 3, 6);
      statsRepo.insertSample(now - HOUR + 2 * MIN, true, 2, 4);
      // bucket one hour later: only gap samples
      statsRepo.insertSample(now - 30 * MIN, false, null, null);
      const h = getHistory("24h", now);
      expect(h.bucketMs).toBe(15 * MIN);
      const at = (ts: number) => h.buckets.find((b) => b.ts === ts)!;
      const b1 = at(now - HOUR);
      expect(b1).toMatchObject({ maxPeers: 6, avgPeers: 4, maxRooms: 3, gap: false });
      const b2 = at(now - 30 * MIN);
      expect(b2).toMatchObject({ maxPeers: null, avgPeers: null, gap: true });
      // bucket before the first sample: no data (not a gap, not zero)
      expect(at(now - 5 * HOUR)).toMatchObject({ maxPeers: null, gap: false });
      // bucket after the first sample without any successful measurement: gap
      expect(at(now - 15 * MIN)).toMatchObject({ maxPeers: null, gap: true });
      // gapless sequence, strictly one bucket apart
      for (let i = 1; i < h.buckets.length; i++) expect(h.buckets[i]!.ts - h.buckets[i - 1]!.ts).toBe(15 * MIN);
      expect(h.peakPeers).toBe(6);
      expect(h.peakRooms).toBe(3);
    });

    it("aggregates 7d per hour and 30d per 6 hours", () => {
      const now = T0 + 12 * HOUR;
      statsRepo.insertSample(now - 2 * DAY, true, 1, 3);
      statsRepo.insertSample(now - 2 * DAY + 10 * MIN, true, 1, 5);
      statsRepo.insertSample(now - 2 * DAY + 5 * HOUR, true, 2, 8);
      const week = getHistory("7d", now);
      expect(week.buckets.find((b) => b.ts === now - 2 * DAY)).toMatchObject({ maxPeers: 5, avgPeers: 4 });
      const month = getHistory("30d", now);
      // 0h and 5h after start fall into the same 6 h bucket
      expect(month.buckets.find((b) => b.ts === now - 2 * DAY)).toMatchObject({ maxPeers: 8, maxRooms: 2 });
      expect(month.buckets.length).toBe(30 * 4 + 1);
    });

    it("fillBuckets is pure and treats okCount 0 as gap", () => {
      const out = fillBuckets([{ b: 0, maxPeers: null, avgPeers: null, maxRooms: null, okCount: 0 }], 0, 2 * HOUR, HOUR);
      expect(out.map((b) => b.gap)).toEqual([true, true, true]);
    });

    it("fillBuckets: buckets before the first sample are no data, not gaps", () => {
      const rows = [{ b: 2 * HOUR, maxPeers: 3, avgPeers: 1, maxRooms: 1, okCount: 5 }];
      const out = fillBuckets(rows, 0, 3 * HOUR, HOUR, 2 * HOUR + 60_000);
      expect(out.map((b) => b.gap)).toEqual([false, false, false, true]);
      expect(out[0]?.maxPeers).toBeNull();
      expect(fillBuckets([], 0, HOUR, HOUR, null).every((b) => !b.gap && b.maxPeers === null)).toBe(true);
    });

    it("overview tiles: peak 24h and participant minutes (sum of peers per minute sample, 7 days)", async () => {
      const now = T0 + 12 * HOUR;
      statsRepo.insertSample(now - 3 * DAY, true, 1, 10); // counts for minutes, not for peak 24h
      statsRepo.insertSample(now - 2 * HOUR, true, 2, 4);
      statsRepo.insertSample(now - 2 * HOUR + MIN, true, 2, 7);
      statsRepo.insertSample(now - 2 * HOUR + 2 * MIN, false, null, null); // gap: neither peak nor minutes
      statsRepo.insertSample(now - 8 * DAY, true, 1, 99); // outside 7 days
      const o = await getOverview(now, async () => okResult(1, 3, [{ room: "r", peers: 3 }]));
      expect(o.tiles).toMatchObject({ activeRooms: 1, peersNow: 3, peak24h: 7, participantMinutes7d: 10 + 4 + 7 });
    });
  });

  describe("gap handling", () => {
    it("stores a gap (ok=0, NULL) when CouchChat is unreachable, never zero", async () => {
      const now = T0 + MIN;
      await sampleOnce(now, async () => ({ ok: false, reason: "unreachable" }));
      const h = getHistory("24h", now);
      expect(h.buckets.at(-1)).toMatchObject({ gap: true, maxPeers: null });
      expect(h.peakPeers).toBe(0);
      const o = await getOverview(now + 10 * MIN, async () => ({ ok: false, reason: "unreachable" }));
      expect(o.live.status).toBe("unreachable");
      expect(o.tiles.activeRooms).toBeNull();
      expect(o.tiles.peersNow).toBeNull();
      expect(o.tiles.participantMinutes7d).toBe(0);
    });

    it("stores a real zero as 0, not as gap, and nothing when not configured", async () => {
      await sampleOnce(T0, async () => okResult(0, 0));
      expect(getHistory("24h", T0).buckets.at(-1)).toMatchObject({ gap: false, maxPeers: 0 });
      resetSamplerState();
      delete process.env.COUCHCHAT_INTERNAL_URL;
      await sampleOnce(T0 + MIN);
      const n = statsRepo.aggregate(0, 15 * MIN).reduce((s, r) => s + r.okCount, 0);
      expect(n).toBe(1);
      const o = await getOverview(T0 + 2 * MIN);
      expect(o.live.status).toBe("unconfigured");
    });

    it("tracks room sessions (open since) and closes vanished rooms; a long gap starts a new session", async () => {
      await poll(T0, async () => okResult(2, 3, [{ room: "alpha", peers: 2 }, { room: "beta", peers: 1 }]));
      resetSamplerState();
      await poll(T0 + 5 * MIN, async () => okResult(1, 4, [{ room: "alpha", peers: 4 }]));
      const open = statsRepo.openSince();
      expect(open.get("alpha")).toBe(T0);
      expect(open.has("beta")).toBe(false);
      resetSamplerState();
      await poll(T0 + 2 * HOUR, async () => okResult(1, 1, [{ room: "alpha", peers: 1 }]));
      expect(statsRepo.openSince().get("alpha")).toBe(T0 + 2 * HOUR);
    });

    it("overview lists rooms with open-since, sorted by participants", async () => {
      await poll(T0, async () => okResult(2, 3, [{ room: "a", peers: 1 }, { room: "b", peers: 2 }]));
      const o = await getOverview(T0 + 1000);
      expect(o.live.roomList?.map((r) => [r.room, r.peers])).toEqual([["b", 2], ["a", 1]]);
      expect(o.live.roomList?.[0]?.openSince).toBe(new Date(T0).toISOString());
    });
  });

  describe("retention", () => {
    it("purges samples and sessions older than 30 days only", async () => {
      const now = T0 + 40 * DAY;
      statsRepo.insertSample(now - 31 * DAY, true, 1, 1);
      statsRepo.insertSample(now - 29 * DAY, true, 1, 2);
      statsRepo.syncSessions(now - 31 * DAY, [{ room: "old", peers: 1 }]);
      statsRepo.syncSessions(now - 1 * HOUR, [{ room: "new", peers: 1 }]);
      const r = purgeStats(now);
      expect(r.samples).toBe(1);
      expect(r.sessions).toBe(1);
      expect(statsRepo.aggregate(0, DAY).length).toBe(1);
      expect([...statsRepo.openSince().keys()]).toEqual(["new"]);
    });
  });

  describe("name stripping", () => {
    const NAMES = ["Alice Muster", "Bob_Secret", "carol@example.org"];
    const dump = (v: unknown) => JSON.stringify(v);

    it("activeRooms payload: only room id and a peer count survive", () => {
      const payload = {
        activeRooms: [
          { id: "teamraum", peers: 2, join: "https://x/teamraum", peer_name: NAMES[0], peers_info: [{ peer_name: NAMES[1] }] },
          { id: "zwei", peers: [{ peer_name: NAMES[0] }, { peer_name: NAMES[2] }] },
        ],
      };
      const out = sanitizeActiveRooms(payload);
      expect(out).toEqual([
        { room: "teamraum", peers: 2 },
        { room: "zwei", peers: 2 },
      ]);
      for (const n of NAMES) expect(dump(out)).not.toContain(n);
    });

    it("meetings payload: names are never read, only counted", () => {
      const payload = {
        meetings: {
          room1: { p1: { peer_name: NAMES[0], peer_id: "p1" }, p2: { peer_name: NAMES[1] }, lock: true, password: "geheim" },
        },
      };
      const out = sanitizeActiveRooms(payload);
      expect(out).toEqual([{ room: "room1", peers: 2 }]);
      for (const n of [...NAMES, "geheim"]) expect(dump(out)).not.toContain(n);
    });

    it("stats payload keeps only two numbers; garbage is rejected", () => {
      expect(sanitizeStats({ totalRooms: 2, totalPeers: 5, timestamp: "x", name: NAMES[0] })).toEqual({ rooms: 2, peers: 5 });
      expect(sanitizeStats({ totalRooms: "2", totalPeers: 5 })).toBeNull();
      expect(sanitizeStats(null)).toBeNull();
      expect(sanitizeActiveRooms("x")).toBeNull();
      expect(sanitizeActiveRooms({ activeRooms: [{ id: 5 }, { id: "" }, null] })).toEqual([]);
    });

    it("end to end: names in the API responses never reach the database or the overview", async () => {
      const calls: { url: string; auth: string | null }[] = [];
      const fake: FetchLike = async (url, init) => {
        calls.push({ url, auth: new Headers(init.headers).get("authorization") });
        const body = url.endsWith("/stats")
          ? { success: true, totalRooms: 1, totalPeers: 2, who: NAMES[0] }
          : { activeRooms: [{ id: "raum", peers: 2, join: `https://x/raum?name=${NAMES[1]}`, peer_name: NAMES[2] }] };
        return new Response(JSON.stringify(body), { status: 200 });
      };
      const r = await fetchSnapshot(fake);
      expect(r).toMatchObject({ ok: true, snapshot: { rooms: 1, peers: 2, roomList: [{ room: "raum", peers: 2 }] } });
      expect(calls.map((c) => c.url)).toEqual(["http://couchchat:3000/api/v1/stats", "http://couchchat:3000/api/v1/activeRooms"]);
      expect(calls.every((c) => c.auth === "test-key")).toBe(true);
      expect(dump(r)).not.toMatch(/Alice|Bob_Secret|carol/);

      await sampleOnce(T0, async () => r);
      const o = await getOverview(T0 + 1000, async () => r);
      expect(dump(o)).not.toMatch(/Alice|Bob_Secret|carol/);
      const rows = [
        ...(statsRepo.aggregate(0, 15 * MIN) as unknown[]),
        ...(statsRepo.openSince() as Map<string, number>).keys(),
      ];
      expect(dump(rows)).not.toMatch(/Alice|Bob_Secret|carol/);
    });

    it("fetchSnapshot: 403 -> unauthorized, network error / bad JSON -> unreachable, missing activeRooms -> roomList null", async () => {
      const mk = (f: (url: string) => Response | Promise<Response>): FetchLike => async (url) => f(url);
      expect(await fetchSnapshot(mk(() => new Response("{}", { status: 403 })))).toEqual({ ok: false, reason: "unauthorized" });
      expect(await fetchSnapshot(mk(() => { throw new Error("ECONNREFUSED"); }))).toEqual({ ok: false, reason: "unreachable" });
      expect(await fetchSnapshot(mk(() => new Response("<html>", { status: 200 })))).toEqual({ ok: false, reason: "unreachable" });
      const noRooms = await fetchSnapshot(
        mk((u) => (u.endsWith("/stats") ? new Response(JSON.stringify({ totalRooms: 0, totalPeers: 0 })) : new Response("{}", { status: 403 }))),
      );
      expect(noRooms).toMatchObject({ ok: true, snapshot: { rooms: 0, peers: 0, roomList: null } });
    });
  });

  describe("API authorization", () => {
    async function cookieFor(role: "admin" | "user"): Promise<string> {
      usersRepo.insert(
        { username: role, displayname: role, passwordHash: await hashPassword("Test!Pass123x"), role, allowedRooms: ["*"], active: true },
        Date.now(),
      );
      const { token } = await login(role, "Test!Pass123x", meta);
      return `cc_admin=${token}`;
    }
    const req = (path: string, cookie?: string) =>
      new Request(`http://localhost:3021${path}`, { headers: cookie ? { cookie } : {} });

    it("rejects anonymous (401) and user role (403) on both endpoints, admin gets 200", async () => {
      const user = await cookieFor("user");
      const admin = await cookieFor("admin");
      for (const [GET, p] of [
        [overviewGET, "/api/stats/overview"],
        [historyGET, "/api/stats/history?range=24h"],
      ] as const) {
        expect((await GET(req(p))).status).toBe(401);
        expect((await GET(req(p, user))).status).toBe(403);
      }
      // keep the network out of it: CouchChat URL is unreachable-by-config
      delete process.env.COUCHCHAT_INTERNAL_URL;
      const o = await overviewGET(req("/api/stats/overview", admin));
      expect(o.status).toBe(200);
      const ob = await o.json();
      expect(ob.live.status).toBe("unconfigured");
      expect(ob.system.panel.version).toMatch(/^\d+\.\d+\.\d+/);
      const h = await historyGET(req("/api/stats/history?range=7d", admin));
      expect(h.status).toBe(200);
      expect((await h.json()).bucketMs).toBe(HOUR);
    });

    it("validates the range with zod (400)", async () => {
      const admin = await cookieFor("admin");
      expect((await historyGET(req("/api/stats/history?range=1y", admin))).status).toBe(400);
      expect((await historyGET(req("/api/stats/history", admin))).status).toBe(200); // default 24h
    });
  });
});
