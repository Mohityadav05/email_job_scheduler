import redis from "./redis";
import { config } from "../config";

// Lua script for atomic increment + expire.
// Returns 1 if the counter is now at or below the limit, 0 if it exceeds it.
// We track the count in a key that expires after 2 hours so stale keys don't pile up.
const incrIfUnderLimitScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, ttl)
end
if current > limit then
  return 0
end
return 1
`;

function hourWindowKey(senderId: string): string {
  const window = Math.floor(Date.now() / 3_600_000);
  return `rate:${senderId}:${window}`;
}

// Returns true if we're within the hourly limit (and increments the counter).
// Returns false if the limit is already reached for this hour window.
export async function checkAndIncrRateLimit(senderId: string): Promise<boolean> {
  const key = hourWindowKey(senderId);
  const result = await redis.eval(
    incrIfUnderLimitScript,
    1,
    key,
    config.MAX_EMAILS_PER_HOUR_PER_SENDER,
    7200 // 2-hour TTL so keys expire automatically
  );
  return result === 1;
}

// Returns milliseconds until the next hour window starts, plus a small offset
// so jobs that were queued earlier in the hour get processed first.
export function msUntilNextHourWindow(offset = 0): number {
  const now = Date.now();
  const nextWindow = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
  return nextWindow - now + offset;
}

// SET NX PX guard for minimum delay between sends on the same sender.
// Returns true if the lock was acquired (safe to send), false if it's still held.
export async function acquireMinDelayLock(senderId: string): Promise<boolean> {
  const key = `mindelay:${senderId}`;
  const result = await redis.set(key, "1", "PX", config.MIN_DELAY_MS, "NX");
  return result === "OK";
}

// Returns how many milliseconds are left on the min-delay lock for this sender.
export async function minDelayLockTtlMs(senderId: string): Promise<number> {
  const key = `mindelay:${senderId}`;
  const pttl = await redis.pttl(key);
  return Math.max(0, pttl);
}
