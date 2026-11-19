import type { DatabaseSync } from "node:sqlite";

// Append-only list. PRAGMA user_version stores how many have been applied.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    displayname   TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','user')),
    allowed_rooms TEXT NOT NULL DEFAULT '["*"]',
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until  INTEGER,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    ip           TEXT,
    user_agent   TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  CREATE TABLE audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              INTEGER NOT NULL,
    actor_id        INTEGER,
    actor_username  TEXT,
    action          TEXT NOT NULL,
    target_username TEXT,
    ip              TEXT,
    details         TEXT
  );
  CREATE INDEX idx_audit_ts ON audit(ts);
  CREATE INDEX idx_audit_action ON audit(action, ts);
  `,
  // Nutzungsstatistik. ok=0 ist eine Messlücke (CouchChat nicht erreichbar): rooms/peers sind dann NULL, nicht 0.
  // room_sessions enthält nur Raumnamen und Zeiten, nie Teilnehmernamen.
  `
  CREATE TABLE samples (
    ts    INTEGER PRIMARY KEY,
    ok    INTEGER NOT NULL CHECK (ok IN (0,1)),
    rooms INTEGER,
    peers INTEGER
  );
  CREATE TABLE room_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room       TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    max_peers  INTEGER NOT NULL,
    closed     INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0,1))
  );
  CREATE INDEX idx_room_sessions_open ON room_sessions(closed, room);
  CREATE INDEX idx_room_sessions_last ON room_sessions(last_seen);
  `,
];

/** Number of migrations = schema version (PRAGMA user_version). */
export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
