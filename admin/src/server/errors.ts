export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export const badRequest = (m: string, fields?: Record<string, string>) => new AppError(400, "bad_request", m, fields);
export const unauthorized = (m = "Nicht angemeldet.") => new AppError(401, "unauthorized", m);
export const forbidden = (m = "Keine Berechtigung.") => new AppError(403, "forbidden", m);
export const notFound = (m = "Nicht gefunden.") => new AppError(404, "not_found", m);
export const conflict = (m: string, fields?: Record<string, string>) => new AppError(409, "conflict", m, fields);
export const tooMany = (m = "Zu viele Versuche. Bitte später erneut versuchen.") => new AppError(429, "rate_limited", m);
