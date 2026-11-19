import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "../config";
import { migrate } from "./migrations";

// Kept on globalThis: Next.js may bundle this module into several server chunks.
const g = globalThis as unknown as { __ccAdminDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__ccAdminDb) {
    mkdirSync(dataDir(), { recursive: true });
    const db = new DatabaseSync(path.join(dataDir(), "admin.sqlite"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
    migrate(db);
    g.__ccAdminDb = db;
  }
  return g.__ccAdminDb;
}

export function closeDb(): void {
  g.__ccAdminDb?.close();
  g.__ccAdminDb = undefined;
}

/** Runs fn inside an immediate transaction (node:sqlite is synchronous, so fn must be too). */
export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
