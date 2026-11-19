import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditRepo } from "@/server/repositories/audit";
import { listAudit, purgeAudit, recordAudit } from "@/server/services/audit";
import { freshEnv } from "./helpers";

describe("audit log", () => {
  let env: ReturnType<typeof freshEnv>;
  beforeEach(() => {
    env = freshEnv();
  });
  afterEach(() => env.cleanup());

  it("purges entries older than 30 days only", () => {
    const now = Date.now();
    const day = 86_400_000;
    recordAudit({ action: "login.success", targetUsername: "old" }, now - 31 * day);
    recordAudit({ action: "login.success", targetUsername: "edge-in" }, now - 29 * day);
    recordAudit({ action: "logout", targetUsername: "new" }, now);
    expect(purgeAudit(now)).toBe(1);
    const left = auditRepo.list({ limit: 10, offset: 0 }).rows.map((r) => r.target_username);
    expect(left).toEqual(["new", "edge-in"]);
  });

  it("filters by action and pages", () => {
    for (let i = 0; i < 5; i++) recordAudit({ action: "login.failed", targetUsername: `u${i}` });
    recordAudit({ action: "logout" });
    const r = listAudit({ action: "login.failed", page: 2, pageSize: 2 });
    expect(r.total).toBe(5);
    expect(r.items).toHaveLength(2);
  });
});
