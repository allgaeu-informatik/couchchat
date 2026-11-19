"use client";

import { Activity, Clock, DoorOpen, HardDrive, Server, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { HistoryBucket, LinkStatus, StatsHistory, StatsOverview, StatsRange, SystemInfo } from "@/server/types";
import { Badge } from "./ui";

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "24h", label: "24 Std." },
  { id: "7d", label: "7 Tage" },
  { id: "30d", label: "30 Tage" },
];
const nf = new Intl.NumberFormat("de-DE");
const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** Runs `fn` now and every `ms` while the tab is visible; refreshes immediately when it becomes visible again. */
function useVisibleInterval(fn: () => void, ms: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      fn();
      timer = setInterval(fn, ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fn, ms]);
}

export function StatsPanel() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<StatsRange>("24h");
  const [history, setHistory] = useState<StatsHistory | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<StatsOverview>("GET", "/api/stats/overview"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Statistik nicht verfügbar.");
    }
  }, []);
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api<StatsHistory>("GET", `/api/stats/history?range=${range}`);
      // Ignore a slow response for a range the user has already switched away from
      if (rangeRef.current === range) setHistory(res);
    } catch {
      /* keep the previous chart; the overview call reports errors */
    }
  }, [range]);

  useVisibleInterval(loadOverview, 10_000);
  useVisibleInterval(loadHistory, 60_000);

  const unconfigured = overview?.live.status === "unconfigured";

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger-bg/30 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {unconfigured && (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
          Die Nutzungsstatistik ist nicht eingerichtet: <code>COUCHCHAT_INTERNAL_URL</code> und <code>COUCHCHAT_API_KEY</code> in <code>admin.env</code> setzen.
        </p>
      )}

      <Tiles o={overview} />

      <section aria-labelledby="chart-h" className="rounded-card border border-line bg-surface">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="chart-h" className="text-lg font-semibold">
            Verlauf
          </h2>
          <div role="group" aria-label="Zeitraum" className="inline-flex rounded-lg border border-line bg-ink p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === r.id ? "bg-primary text-white" : "text-muted hover:text-fg"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {history ? <Chart h={history} /> : <p className="py-10 text-center text-sm text-muted">Lade Verlauf ...</p>}
          {history && (
            <p className="mt-3 text-xs text-muted">
              Spitze im Zeitraum: <span className="font-medium text-fg">{nf.format(history.peakPeers)}</span> Teilnehmer in{" "}
              <span className="font-medium text-fg">{nf.format(history.peakRooms)}</span> Räumen
              {history.peakAt ? ` (${new Date(history.peakAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })})` : ""}.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <RoomList o={overview} className="lg:col-span-3" />
        <SystemCard s={overview?.system ?? null} className="lg:col-span-2" />
      </div>

      <p className="text-xs text-muted">
        Erfasst werden nur Anzahlen und Raumnamen, nie Namen von Teilnehmern. Messung jede Minute, Aufbewahrung 30 Tage. „Teilnehmer-Minuten“ ist die Summe der
        Teilnehmerzahlen aller Minuten-Messungen; Zeiten ohne Verbindung zu CouchChat zählen nicht (Messlücke, im Diagramm rot hinterlegt).
      </p>
    </div>
  );
}

function Tile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Tiles({ o }: { o: StatsOverview | null }) {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "–" : nf.format(v));
  const t = o?.tiles;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile icon={<DoorOpen size={16} aria-hidden />} label="Aktive Räume" value={n(t?.activeRooms)} />
      <Tile icon={<Users size={16} aria-hidden />} label="Teilnehmer jetzt" value={n(t?.peersNow)} />
      <Tile icon={<Activity size={16} aria-hidden />} label="Spitze 24 Std." value={n(t?.peak24h)} hint="gleichzeitige Teilnehmer" />
      <Tile icon={<Clock size={16} aria-hidden />} label="Teilnehmer-Minuten" value={n(t?.participantMinutes7d)} hint="letzte 7 Tage" />
    </div>
  );
}

// --- chart (hand-written SVG, presentation attributes only) ---

const W = 720;
const H = 220;
const M = { l: 36, r: 8, t: 10, b: 24 };

function fmtTick(ts: number, range: StatsRange): string {
  const d = new Date(ts);
  return range === "24h"
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}
function fmtTip(b: HistoryBucket): string {
  const when = new Date(b.ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  if (b.gap) return `${when}: Messlücke (keine Daten)`;
  if (b.maxPeers === null) return `${when}: noch keine Messung`;
  return `${when}: Spitze ${b.maxPeers} Teilnehmer, Ø ${nf1.format(b.avgPeers ?? 0)}, bis ${b.maxRooms} Räume`;
}

function Chart({ h }: { h: StatsHistory }) {
  const b = h.buckets;
  const n = Math.max(b.length, 1);
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const maxV = Math.max(2, ...b.map((x) => x.maxPeers ?? 0));
  const top = maxV <= 4 ? maxV : Math.ceil(maxV / 4) * 4;
  const slot = plotW / n;
  const y = (v: number) => M.t + plotH - (v / top) * plotH;
  const x = (i: number) => M.l + i * slot;

  // Average line: one sub-path per run of non-gap buckets.
  let avg = "";
  let pen = false;
  b.forEach((p, i) => {
    if (p.gap || p.avgPeers === null) {
      pen = false;
      return;
    }
    avg += `${pen ? "L" : "M"}${(x(i) + slot / 2).toFixed(1)} ${y(p.avgPeers).toFixed(1)} `;
    pen = true;
  });

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f)).filter((v, i, a) => a.indexOf(v) === i);
  const tickEvery = Math.max(1, Math.round(n / 6));
  const total = b.filter((p) => !p.gap).reduce((s, p) => s + (p.maxPeers ?? 0), 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Teilnehmer im Zeitraum ${h.range}: Spitze ${h.peakPeers}. Balken zeigen die höchste Teilnehmerzahl je Intervall, die Linie den Durchschnitt.`}
      className="h-auto w-full"
    >
      {grid.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className="stroke-white/10" strokeWidth={1} />
          <text x={M.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} className="fill-muted">
            {v}
          </text>
        </g>
      ))}
      {b.map((p, i) =>
        p.gap ? (
          <rect key={p.ts} x={x(i)} y={M.t} width={Math.max(slot - 0.5, 0.5)} height={plotH} className="fill-danger/15" />
        ) : (
          <rect
            key={p.ts}
            x={x(i) + 0.25}
            y={y(p.maxPeers ?? 0)}
            width={Math.max(slot - 0.75, 0.5)}
            height={Math.max(M.t + plotH - y(p.maxPeers ?? 0), 0)}
            className="fill-brand/70"
          />
        ),
      )}
      {avg && <path d={avg} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-gold" />}
      {b.map((p, i) =>
        i % tickEvery === 0 ? (
          <text key={`t${p.ts}`} x={x(i) + slot / 2} y={H - 6} textAnchor="middle" fontSize={10} className="fill-muted">
            {fmtTick(p.ts, h.range)}
          </text>
        ) : null,
      )}
      {/* Hover areas with native tooltips (no script, no inline style) */}
      {b.map((p, i) => (
        <rect key={`h${p.ts}`} x={x(i)} y={M.t} width={slot} height={plotH} fill="transparent">
          <title>{fmtTip(p)}</title>
        </rect>
      ))}
      {total === 0 && b.every((p) => !p.gap) && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} className="fill-muted">
          Keine Teilnehmer im Zeitraum
        </text>
      )}
    </svg>
  );
}

// --- live rooms ---

function sinceText(iso: string | null, nowMs: number): string {
  if (!iso) return "–";
  const t = new Date(iso);
  const mins = Math.max(0, Math.floor((nowMs - t.getTime()) / 60_000));
  const when = t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const dur = mins < 60 ? `${mins} Min.` : `${Math.floor(mins / 60)} Std. ${mins % 60} Min.`;
  return `seit ${when} (${dur})`;
}

function RoomList({ o, className = "" }: { o: StatsOverview | null; className?: string }) {
  const list = o?.live.roomList ?? null;
  const now = o?.live.sampledAt ? Date.parse(o.live.sampledAt) : 0;
  return (
    <section aria-labelledby="rooms-h" className={`rounded-card border border-line bg-surface ${className}`}>
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 id="rooms-h" className="text-lg font-semibold">
          Offene Räume
        </h2>
        <span className="text-xs text-muted">aktualisiert alle 10 Sekunden</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Raum</th>
              <th className="px-4 py-3 font-medium">Teilnehmer</th>
              <th className="px-4 py-3 font-medium">Offen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list?.map((r) => (
              <tr key={r.room}>
                <td className="max-w-[14rem] truncate px-4 py-3 font-medium" title={r.room}>
                  {r.room}
                </td>
                <td className="px-4 py-3 tabular-nums">{nf.format(r.peers)}</td>
                <td className="px-4 py-3 text-muted">{sinceText(r.openSince, now)}</td>
              </tr>
            ))}
            {list && list.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  Zurzeit ist kein Raum offen.
                </td>
              </tr>
            )}
            {!list && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  {!o
                    ? "Lade ..."
                    : o.live.status !== "ok"
                      ? "CouchChat ist nicht erreichbar."
                      : "Die Raumliste ist in CouchChat nicht freigegeben (Image ohne Statistik-Patch, siehe README)."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- system card ---

function bytes(v: number | null): string {
  if (v === null) return "–";
  const gb = v / 1024 ** 3;
  return gb >= 1 ? `${nf1.format(gb)} GB` : `${nf1.format(v / 1024 ** 2)} MB`;
}
function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} T. ${h} Std.` : h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
}
const linkBadge = (s: LinkStatus) =>
  s === "ok" ? <Badge tone="brand">Erreichbar</Badge> : s === "unconfigured" ? <Badge tone="muted">Nicht eingerichtet</Badge> : <Badge tone="danger">Nicht erreichbar</Badge>;

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

function SystemCard({ s, className = "" }: { s: SystemInfo | null; className?: string }) {
  return (
    <section aria-labelledby="sys-h" className={`rounded-card border border-line bg-surface ${className}`}>
      <div className="flex items-center gap-2 border-b border-line p-4">
        <Server size={18} className="text-brand" aria-hidden />
        <h2 id="sys-h" className="text-lg font-semibold">
          System
        </h2>
      </div>
      {!s ? (
        <p className="p-4 text-sm text-muted">Lade ...</p>
      ) : (
        <dl className="divide-y divide-line px-4 text-sm">
          <Row k="CouchChat">
            {linkBadge(s.couchchat.status)}
            {s.couchchat.responseMs !== null && <span className="ml-2 text-xs text-muted">{s.couchchat.responseMs} ms</span>}
          </Row>
          <Row k="Image">{s.couchchat.image}</Row>
          {s.turn && <Row k="TURN-Server">{s.turn.reachable ? <Badge tone="brand">Erreichbar</Badge> : <Badge tone="danger">Nicht erreichbar</Badge>}</Row>}
          <Row k="Host-Sync">
            {s.hostSync.ok ? <Badge tone="brand">OK</Badge> : <Badge tone="danger">Fehlgeschlagen</Badge>}
            {s.hostSync.lastSuccessAt && (
              <span className="ml-2 text-xs text-muted">
                {new Date(s.hostSync.lastSuccessAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
          </Row>
          <Row k="Panel">
            v{s.panel.version}, läuft seit {uptime(s.panel.uptimeSeconds)}
          </Row>
          <Row k="Last (1/5/15 Min.)">{s.host.load.map((x) => nf.format(x)).join(" / ")}</Row>
          <Row k="Arbeitsspeicher frei">
            {bytes(s.host.memFree)} von {bytes(s.host.memTotal)}
          </Row>
          <Row k="Speicherplatz frei">
            <HardDrive size={14} className="mr-1 inline text-muted" aria-hidden />
            {bytes(s.host.diskFree)}
            {s.host.diskTotal !== null && ` von ${bytes(s.host.diskTotal)}`}
          </Row>
          <Row k="Benutzer">
            {s.users.total} gesamt, {s.users.active} aktiv, {s.users.admins} Administratoren
          </Row>
          {s.users.legacyPasswords > 0 && (
            <Row k="Alte Jitsi-Passwörter">
              <ShieldCheck size={14} className="mr-1 inline text-gold" aria-hidden />
              {s.users.legacyPasswords}
            </Row>
          )}
        </dl>
      )}
    </section>
  );
}
