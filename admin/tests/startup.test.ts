import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkWritableDirs } from "@/server/services/bootstrap";

describe("startup directory check", () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("is quiet and true for writable directories (created on demand)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ccstart-"));
    dirs.push(root);
    process.env.DATA_DIR = path.join(root, "data");
    process.env.HOSTDATA_DIR = path.join(root, "hostdata");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(checkWritableDirs()).toBe(true);
    expect(err).not.toHaveBeenCalled();
  });

  it("logs a clear German error with the install hint for an unusable directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ccstart-"));
    dirs.push(root);
    writeFileSync(path.join(root, "blocker"), "x"); // a file where a directory would have to be
    process.env.DATA_DIR = path.join(root, "blocker", "data");
    process.env.HOSTDATA_DIR = path.join(root, "hostdata");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(checkWritableDirs()).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]?.[0])).toMatch(/DATA_DIR.*nicht beschreibbar.*install -d -o 1000 -g 1000/);
  });
});
