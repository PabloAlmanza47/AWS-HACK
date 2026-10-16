export class RequestFailure extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const windows = new Map<string, { count: number; expiresAt: number }>();

export function checkRateLimit(key: string, maximum = 10) {
  const now = Date.now();

  if (windows.size > 5000) {
    for (const [entryKey, entry] of windows) {
      if (entry.expiresAt < now) {
        windows.delete(entryKey);
      }
    }
  }

  const current = windows.get(key);

  if (!current || current.expiresAt < now) {
    windows.set(key, { count: 1, expiresAt: now + 60_000 });
    return;
  }

  if (current.count >= maximum) {
    throw new RequestFailure(
      "Too many requests. Wait a minute and try again.",
      429,
    );
  }

  current.count += 1;
}

export async function readJson(
  request: Request,
  maxBytes = 50_000,
): Promise<unknown> {
  const announcedLength = Number(request.headers.get("content-length") ?? "0");

  if (announcedLength > maxBytes) {
    throw new RequestFailure("Request is too large.", 413);
  }

  const text = await request.text();

  if (text.length > maxBytes) {
    throw new RequestFailure("Request is too large.", 413);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestFailure("Request body must be valid JSON.");
  }
}

export function requestKey(request: Request, prefix: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const address = forwarded?.split(",")[0]?.trim() || "unknown";

  return `${prefix}:${address}`;
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestFailure) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "";

  if (message.includes("BEDROCK_MODEL_ID")) {
    return Response.json({ error: message }, { status: 503 });
  }

  console.error("Request failed", error);

  return Response.json(
    {
      error:
        "The request could not be completed. Check Bedrock access and try again.",
    },
    { status: 502 },
  );
}
