export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("Server nicht erreichbar.", 0);
  }
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string; fields?: Record<string, string> };
  } | null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/")) {
      window.location.replace("/login");
    }
    throw new ApiError(data?.error?.message ?? "Unbekannter Fehler.", res.status, data?.error?.fields ?? {});
  }
  const warning = (data as { warning?: unknown } | null)?.warning;
  if (typeof warning === "string") window.dispatchEvent(new CustomEvent("cc:warning", { detail: warning }));
  return data as T;
}
