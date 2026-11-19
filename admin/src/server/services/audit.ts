import { AUDIT_RETENTION_MS } from "../config";
import { auditRepo } from "../repositories/audit";
import type { AuditAction, AuditRow, RequestMeta } from "../types";

export interface AuditInput {
  action: AuditAction;
  actor?: { id: number; username: string } | null;
  targetUsername?: string | null;
  meta?: Partial<RequestMeta>;
  details?: Record<string, unknown>;
}

/** Never throws: a failing audit write must not break the user's action. Details must never contain secrets. */
export function recordAudit(i: AuditInput, now = Date.now()): void {
  try {
    auditRepo.insert({
      ts: now,
      actorId: i.actor?.id ?? null,
      actorUsername: i.actor?.username ?? null,
      action: i.action,
      targetUsername: i.targetUsername ?? null,
      ip: i.meta?.ip ?? null,
      details: i.details ?? null,
    });
  } catch (e) {
    console.error("audit write failed:", e instanceof Error ? e.message : "unknown error");
  }
}

export function purgeAudit(now = Date.now()): number {
  return auditRepo.purgeOlderThan(now - AUDIT_RETENTION_MS);
}

export function listAudit(opts: { action?: string; page: number; pageSize: number }) {
  const { rows, total } = auditRepo.list({
    action: opts.action,
    limit: opts.pageSize,
    offset: (opts.page - 1) * opts.pageSize,
  });
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    items: rows.map(toAuditView),
  };
}

function toAuditView(r: AuditRow) {
  let details: unknown = null;
  if (r.details) {
    try {
      details = JSON.parse(r.details);
    } catch {
      details = null;
    }
  }
  return {
    id: r.id,
    ts: new Date(r.ts).toISOString(),
    actor: r.actor_username,
    action: r.action,
    target: r.target_username,
    ip: r.ip,
    details,
  };
}
