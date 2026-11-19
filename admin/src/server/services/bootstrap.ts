import { accessSync, constants, mkdirSync } from "node:fs";
import { dataDir, hostDataDir } from "../config";
import { usersRepo } from "../repositories/users";
import { hashPassword, passwordPolicyError } from "../security/password";
import { displaynameSchema, usernameSchema } from "../validation";
import { purgeAudit, recordAudit } from "./audit";
import { purgeSessions } from "./auth";
import { retryHostSyncIfDirty, syncHostUsers } from "./hostSync";
import { startSampler } from "./sampler";
import { purgeStats } from "./stats";

/**
 * Both directories must be writable by the container user (uid 1000 = "node"). With bind mounts created by root
 * (docker compose creates missing host directories as root) the panel would otherwise fail later with a cryptic EACCES.
 * Logs a clear error per directory and returns false; the caller carries on (the later failure is then understandable).
 */
export function checkWritableDirs(): boolean {
  let ok = true;
  for (const [label, dir] of [["DATA_DIR", dataDir()], ["HOSTDATA_DIR", hostDataDir()]] as const) {
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
    } catch (e) {
      ok = false;
      const code = e instanceof Error && "code" in e ? String((e as NodeJS.ErrnoException).code) : "unknown";
      console.error(
        `[admin] FEHLER: ${label} (${dir}) ist nicht beschreibbar (${code}). Das Verzeichnis muss dem Container-Benutzer (uid 1000) gehören, ` +
          "auf dem Host z. B.: install -d -o 1000 -g 1000 hostdata admin-data",
      );
    }
  }
  return ok;
}

/** Creates the first admin from BOOTSTRAP_ADMIN_* if (and only if) the users table is empty. Logs only the username. */
export async function bootstrapAdmin(): Promise<boolean> {
  if (usersRepo.count() > 0) return false;
  const rawUser = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!rawUser || !password) {
    console.warn("[admin] Keine Benutzer vorhanden und kein BOOTSTRAP_ADMIN_USERNAME/_PASSWORD gesetzt.");
    return false;
  }
  const u = usernameSchema.safeParse(rawUser);
  const d = displaynameSchema.safeParse(process.env.BOOTSTRAP_ADMIN_NAME || rawUser);
  const pwErr = passwordPolicyError(password);
  if (!u.success || !d.success || pwErr) {
    console.error("[admin] Bootstrap-Admin abgelehnt: ungültiger Benutzername/Name oder Passwort entspricht nicht der Policy.");
    return false;
  }
  usersRepo.insert(
    {
      username: u.data,
      displayname: d.data,
      passwordHash: await hashPassword(password),
      role: "admin",
      allowedRooms: ["*"],
      active: true,
    },
    Date.now(),
  );
  recordAudit({ action: "user.create", targetUsername: u.data, details: { role: "admin", active: true, bootstrap: true } });
  console.log(`[admin] Bootstrap-Admin angelegt: ${u.data}. BOOTSTRAP_ADMIN_* jetzt aus der Umgebung entfernen.`);
  return true;
}

export function maintenance(): void {
  try {
    purgeAudit();
    purgeSessions();
    purgeStats();
    retryHostSyncIfDirty();
  } catch (e) {
    console.error("maintenance failed:", e instanceof Error ? e.message : "unknown error");
  }
}

const g = globalThis as unknown as { __ccStarted?: boolean };

/** Idempotent startup: bootstrap, host sync, purge, hourly purge. Called from instrumentation.ts. */
export async function startup(): Promise<void> {
  if (g.__ccStarted) return;
  g.__ccStarted = true;
  checkWritableDirs();
  await bootstrapAdmin();
  maintenance();
  syncHostUsers();
  const timer = setInterval(maintenance, 60 * 60 * 1000);
  timer.unref();
  startSampler();
}
