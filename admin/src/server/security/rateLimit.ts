/** Small in-memory fixed-window limiter (single process; state is lost on restart, which is acceptable here). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Counts an attempt; returns false when the limit is exceeded. */
  consume(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) this.prune(now);
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count += 1;
    return e.count <= this.max;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    if (this.hits.size > 10_000) this.hits.clear();
  }
}

const g = globalThis as unknown as { __ccLimiters?: Record<string, RateLimiter> };
g.__ccLimiters ??= {
  loginIp: new RateLimiter(40, 15 * 60_000),
  loginUser: new RateLimiter(20, 15 * 60_000),
  passwordChange: new RateLimiter(10, 15 * 60_000),
};
export const limiters = g.__ccLimiters as Record<"loginIp" | "loginUser" | "passwordChange", RateLimiter>;
