import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// Con Upstash configurado el límite es distribuido; sin él (entorno local) se usa memoria del proceso.
const hasRedis = Boolean(
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
);
const redis = hasRedis ? Redis.fromEnv() : null;
const memoryHits = new Map<string, number[]>();
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number) {
  const cacheKey = `${limit}:${windowMs}`;
  let limiter = limiters.get(cacheKey);

  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${Math.max(1, Math.round(windowMs / 1000))} s`),
      prefix: "presservac-ratelimit",
    });
    limiters.set(cacheKey, limiter);
  }

  return limiter;
}

/** Rate limit distribuido vía Upstash Redis — persiste entre cold starts serverless. */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!redis) {
    const now = Date.now();
    const hits = (memoryHits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      memoryHits.set(key, hits);
      return false;
    }
    hits.push(now);
    memoryHits.set(key, hits);
    return true;
  }
  const { success } = await getLimiter(limit, windowMs).limit(key);
  return success;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
