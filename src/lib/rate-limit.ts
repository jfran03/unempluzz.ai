/**
 * Simple in-memory rate limiter. No external deps needed for single-user app.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { ok: boolean } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= maxRequests) {
    return { ok: false };
  }

  entry.count++;
  return { ok: true };
}

export function rateLimitResponse() {
  return Response.json(
    { error: "Too many requests. Try again later." },
    { status: 429 }
  );
}
