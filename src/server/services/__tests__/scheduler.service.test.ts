/**
 * @jest-environment node
 *
 * Unit tests for src/server/services/scheduler.service.ts
 * Covers: processUnlocks, processExpiries (stub behaviour)
 */

import { processUnlocks, processExpiries } from "../scheduler.service";

describe("processUnlocks", () => {
  it("returns 0 (stub — no DB wired yet)", async () => {
    const count = await processUnlocks();
    expect(count).toBe(0);
  });

  it("resolves without throwing", async () => {
    await expect(processUnlocks()).resolves.not.toThrow();
  });
});

describe("processExpiries", () => {
  it("resolves without throwing", async () => {
    await expect(processExpiries()).resolves.not.toThrow();
  });

  it("returns undefined (void)", async () => {
    const result = await processExpiries();
    expect(result).toBeUndefined();
  });
});
