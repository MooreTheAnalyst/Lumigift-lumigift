import { isValidTransition, assertValidTransition } from "../gift-state-machine";
import type { GiftStatus } from "@/types";

describe("gift state machine", () => {
  // ─── Valid transitions ───────────────────────────────────────────────────────
  const validPaths: [GiftStatus, GiftStatus][] = [
    ["pending_payment", "funded"],
    ["funded",          "locked"],
    ["locked",          "unlocked"],
    ["unlocked",        "claimed"],
    // any → cancelled
    ["pending_payment", "cancelled"],
    ["funded",          "cancelled"],
    ["locked",          "cancelled"],
    ["unlocked",        "cancelled"],
  ];

  test.each(validPaths)("%s → %s is valid", (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  // ─── Invalid transitions ─────────────────────────────────────────────────────
  const invalidPaths: [GiftStatus, GiftStatus][] = [
    ["pending_payment", "locked"],    // skip funded
    ["pending_payment", "claimed"],   // skip multiple steps
    ["locked",          "claimed"],   // skip unlocked
    ["claimed",         "unlocked"],  // backwards
    ["cancelled",       "locked"],    // from terminal state
    ["claimed",         "cancelled"], // from terminal state
  ];

  test.each(invalidPaths)("%s → %s is invalid", (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  // ─── assertValidTransition ───────────────────────────────────────────────────
  it("does not throw for a valid transition", () => {
    expect(() => assertValidTransition("locked", "unlocked")).not.toThrow();
  });

  it("throws a descriptive error for an invalid transition", () => {
    expect(() => assertValidTransition("cancelled", "locked")).toThrow(
      'Invalid gift status transition: "cancelled" → "locked"'
    );
  });
});
