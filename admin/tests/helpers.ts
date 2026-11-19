import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb } from "@/server/db/connection";

export function freshEnv() {
  closeDb();
  const root = mkdtempSync(path.join(tmpdir(), "ccadmin-"));
  process.env.DATA_DIR = path.join(root, "data");
  process.env.HOSTDATA_DIR = path.join(root, "hostdata");
  process.env.COOKIE_SECURE = "false";
  return {
    root,
    hostDir: process.env.HOSTDATA_DIR,
    cleanup: () => {
      closeDb();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export const meta = { ip: "127.0.0.1", userAgent: "vitest" };
