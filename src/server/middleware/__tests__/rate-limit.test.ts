/**
 * Unit tests for the rateLimit helper in src/server/middleware/index.ts
 * Covers: allow within limit, block on exceed, window reset, independent keys.
 *
 * next/server requires Web Fetch globals not present in jsdom, so we mock it.
 */

// Mock next/server before any import of the middleware module
jest.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: jest.fn(),
  },
}));

// Mock next-auth so withAuth doesn't pull in server-only deps
jest.mock("next-auth", () => ({ default: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));

import { rateLimit } from "@/server/middleware";

// Reset the module-level Map between tests by re-importing after resetModules.
// Since the Map is module-level state we isolate tests via unique keys.

afterEach(() => {
  jest.restoreAllMocks();
});

describe("rateLimit", () => {
  const WINDOW = 60_000;
  const LIMIT = 3;

  it("allows requests within the limit", () => {
    const key = "test-allow-+2348011111111";
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(true);
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(true);
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const key = "test-block-+2348022222222";
    rateLimit(key, LIMIT, WINDOW);
    rateLimit(key, LIMIT, WINDOW);
    rateLimit(key, LIMIT, WINDOW);
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(false);
  });

  it("resets the counter after the window expires", () => {
    const key = "test-reset-+2348033333333";
    const start = 1_000_000;
    jest.spyOn(Date, "now").mockReturnValue(start);

    rateLimit(key, LIMIT, WINDOW);
    rateLimit(key, LIMIT, WINDOW);
    rateLimit(key, LIMIT, WINDOW);
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(false);

    // Advance past the window
    jest.spyOn(Date, "now").mockReturnValue(start + WINDOW + 1);
    expect(rateLimit(key, LIMIT, WINDOW)).toBe(true);
  });

  it("tracks different phone numbers independently", () => {
    const keyA = "test-indep-A-+2348044444444";
    const keyB = "test-indep-B-+2348055555555";

    rateLimit(keyA, LIMIT, WINDOW);
    rateLimit(keyA, LIMIT, WINDOW);
    rateLimit(keyA, LIMIT, WINDOW);
    expect(rateLimit(keyA, LIMIT, WINDOW)).toBe(false);

    expect(rateLimit(keyB, LIMIT, WINDOW)).toBe(true);
  });

  it("allows exactly `limit` requests then blocks", () => {
    const key = "test-exact-+2348066666666";
    const results = Array.from({ length: LIMIT + 2 }, () =>
      rateLimit(key, LIMIT, WINDOW)
    );
    expect(results.slice(0, LIMIT)).toEqual(Array(LIMIT).fill(true));
    expect(results.slice(LIMIT)).toEqual(Array(2).fill(false));
  });
});
