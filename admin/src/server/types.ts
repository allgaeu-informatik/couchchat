export type Role = "admin" | "user";

export interface UserRow {
  id: number;
  username: string;
  displayname: string;
  password_hash: string;
  role: Role;
  allowed_rooms: string; // JSON array
  active: number;
  failed_logins: number;
  locked_until: number | null;
  created_at: number;
  updated_at: number;
}

export interface PublicUser {
  id: number;
  username: string;
  displayname: string;
  role: Role;
  allowedRooms: string[];
  active: boolean;
  locked: boolean;
  /** True while the password is still an imported Jitsi/Prosody SCRAM hash (never the hash itself). */
  legacyPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUser {
  id: number;
  username: string;
  displayname: string;
  role: Role;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export interface AuditRow {
  id: number;
  ts: number;
  actor_id: number | null;
  actor_username: string | null;
  action: string;
  target_username: string | null;
  ip: string | null;
  details: string | null;
}

export const AUDIT_ACTIONS = [
  "login.success",
  "login.failed",
  "login.locked",
  "logout",
  "user.create",
  "user.update",
  "user.delete",
  "password.change",
  "password.reset",
  "password.rehash",
  "user.import",
  "hostsync.error",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// --- Statistik ---
export const STATS_RANGES = ["24h", "7d", "30d"] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export type LinkStatus = "ok" | "unreachable" | "unconfigured";

export interface LiveRoom {
  room: string;
  peers: number;
  /** ISO-Zeitpunkt, seit dem der Raum in den Messungen offen ist (null, wenn unbekannt). */
  openSince: string | null;
}

export interface HistoryBucket {
  /** Beginn des Intervalls (ms seit Epoche). */
  ts: number;
  maxPeers: number | null;
  avgPeers: number | null;
  maxRooms: number | null;
  /** true, wenn im Intervall keine einzige erfolgreiche Messung vorliegt. */
  gap: boolean;
}

export interface StatsHistory {
  range: StatsRange;
  bucketMs: number;
  from: number;
  to: number;
  buckets: HistoryBucket[];
  peakPeers: number;
  peakRooms: number;
  peakAt: string | null;
}

export interface SystemInfo {
  couchchat: {
    status: LinkStatus;
    responseMs: number | null;
    lastOkAt: string | null;
    image: string;
    /** null = unbekannt, false = Endpunkt activeRooms nicht freigegeben. */
    roomListAvailable: boolean | null;
  };
  panel: { version: string; uptimeSeconds: number };
  host: { load: [number, number, number]; memTotal: number; memFree: number; diskFree: number | null; diskTotal: number | null };
  turn: { reachable: boolean } | null;
  hostSync: { ok: boolean; lastSuccessAt: string | null };
  users: { total: number; active: number; admins: number; legacyPasswords: number };
}

export interface StatsOverview {
  live: {
    status: LinkStatus;
    rooms: number | null;
    peers: number | null;
    roomList: LiveRoom[] | null;
    sampledAt: string | null;
  };
  tiles: { activeRooms: number | null; peersNow: number | null; peak24h: number; participantMinutes7d: number };
  system: SystemInfo;
}
