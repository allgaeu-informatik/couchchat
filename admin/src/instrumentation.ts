export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Skip during `next build` (page data collection) so no database is created at build time.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startup } = await import("@/server/services/bootstrap");
  await startup();
}
