// Runtime configuration, read lazily so tests can change process.env.
export function appOrigin(): string {
  return (process.env.APP_ORIGIN ?? "http://localhost:3021").trim().replace(/\/+$/, "");
}
export const dataDir = () => process.env.DATA_DIR ?? "/data";
export const hostDataDir = () => process.env.HOSTDATA_DIR ?? "/hostdata";
export const cookieSecure = () => process.env.COOKIE_SECURE !== "false";
export const trustProxy = () => process.env.TRUST_PROXY === "true";
export const cookieName = () => (cookieSecure() ? "__Host-cc_admin" : "cc_admin");

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const LOCK_THRESHOLD = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
export const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// --- Nutzungsstatistik (nur Anzahlen und Raumnamen, nie Teilnehmernamen) ---
/** Interne Basis-URL von CouchChat im Compose-Netz, z. B. http://couchchat:3000. Leer = Statistik aus. */
export const couchchatUrl = () => (process.env.COUCHCHAT_INTERNAL_URL ?? "").trim().replace(/\/+$/, "");
/** Wert von API_KEY_SECRET aus couchchat.env (Header "authorization"). */
export const couchchatApiKey = () => (process.env.COUCHCHAT_API_KEY ?? "").trim();
export const couchchatImage = () => (process.env.COUCHCHAT_IMAGE ?? "").trim() || "unbekannt";
export const turnHost = () => (process.env.TURN_HOST ?? "").trim();
export const turnPort = () => {
  const n = Number(process.env.TURN_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3478;
};
export const SAMPLE_INTERVAL_MS = 60 * 1000;
export const SAMPLE_TIMEOUT_MS = 4000;
export const STATS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
