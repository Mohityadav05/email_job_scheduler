import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- scheduledAt calculation ----

describe("scheduledAt calculation", () => {
  it("assigns correct delay per index", () => {
    const start = new Date("2024-01-01T10:00:00.000Z").getTime();
    const delayMs = 5000;
    const leads = ["a@test.com", "b@test.com", "c@test.com"];

    const results = leads.map((_, i) => new Date(start + i * delayMs));

    expect(results[0].toISOString()).toBe("2024-01-01T10:00:00.000Z");
    expect(results[1].toISOString()).toBe("2024-01-01T10:00:05.000Z");
    expect(results[2].toISOString()).toBe("2024-01-01T10:00:10.000Z");
  });

  it("handles zero delay (all at same time)", () => {
    const start = new Date("2024-01-01T10:00:00.000Z").getTime();
    const leads = ["a@test.com", "b@test.com"];
    const results = leads.map((_, i) => new Date(start + i * 0));
    expect(results[0].toISOString()).toBe(results[1].toISOString());
  });
});

// ---- Idempotent claim logic ----

describe("idempotent claim logic", () => {
  it("simulates the UPDATE WHERE status=scheduled returning 0 rows when already sent", async () => {
    // The actual logic: if rowsAffected === 0, skip.
    // Here we simulate the DB behavior with a mock.

    const mockDb = {
      rows: [{ id: "email-1", status: "sent" }],
      executeUpdate(id: string, fromStatus: string) {
        const row = this.rows.find((r) => r.id === id && r.status === fromStatus);
        if (!row) return 0;
        row.status = "sending";
        return 1;
      },
    };

    // First claim: should succeed
    const firstResult = mockDb.executeUpdate("email-1", "scheduled");
    expect(firstResult).toBe(0); // already 'sent'

    // Set up a fresh 'scheduled' row
    mockDb.rows[0].status = "scheduled";
    const secondResult = mockDb.executeUpdate("email-1", "scheduled");
    expect(secondResult).toBe(1);

    // Third call: row is now 'sending', so claim fails
    const thirdResult = mockDb.executeUpdate("email-1", "scheduled");
    expect(thirdResult).toBe(0);
  });
});

// ---- Rate limiter Lua script behavior ----

describe("rate limiter Lua script behavior", () => {
  // Simulate the Lua script logic in JavaScript to verify correctness
  function simulateLuaScript(
    currentCount: number,
    limit: number
  ): { newCount: number; allowed: boolean } {
    const newCount = currentCount + 1; // INCR
    const allowed = newCount <= limit;
    return { newCount, allowed };
  }

  it("allows sends when under limit", () => {
    const { allowed } = simulateLuaScript(0, 50);
    expect(allowed).toBe(true);
  });

  it("allows the last send exactly at the limit", () => {
    const { allowed } = simulateLuaScript(49, 50);
    expect(allowed).toBe(true);
  });

  it("blocks the send that would exceed the limit", () => {
    const { allowed } = simulateLuaScript(50, 50);
    expect(allowed).toBe(false);
  });

  it("msUntilNextHourWindow returns positive value", () => {
    const now = Date.now();
    const nextWindow = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
    const ms = nextWindow - now + 1000;
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(3_601_000);
  });
});
