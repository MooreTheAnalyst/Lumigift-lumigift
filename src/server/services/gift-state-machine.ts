import type { GiftStatus } from "@/types";

// Valid transitions: from → Set<to>
// Each status only allows specific forward (and cancel) transitions to prevent
// invalid state changes such as re-funding a claimed gift.
const TRANSITIONS: Record<GiftStatus, Set<GiftStatus>> = {
  pending_payment: new Set<GiftStatus>(["funded", "cancelled"]),
  funded:          new Set<GiftStatus>(["locked", "cancelled"]),
  locked:          new Set<GiftStatus>(["unlocked", "cancelled"]),
  unlocked:        new Set<GiftStatus>(["claimed", "cancelled"]),
  claimed:         new Set<GiftStatus>(),
  cancelled:       new Set<GiftStatus>(),
  // legacy / edge statuses
  draft:           new Set<GiftStatus>(["pending_payment", "cancelled"]),
  expired:         new Set<GiftStatus>(),
};

/**
 * Returns `true` if transitioning a gift from `current` to `next` is a valid
 * state-machine transition.
 *
 * @param current - The gift's current {@link GiftStatus}.
 * @param next - The desired target {@link GiftStatus}.
 * @returns `true` if the transition is allowed, `false` otherwise.
 */
export function isValidTransition(current: GiftStatus, next: GiftStatus): boolean {
  return TRANSITIONS[current]?.has(next) ?? false;
}

/**
 * Asserts that transitioning from `current` to `next` is valid.
 * Throws a descriptive error if the transition is not permitted, preventing
 * callers from accidentally corrupting gift state.
 *
 * @param current - The gift's current {@link GiftStatus}.
 * @param next - The desired target {@link GiftStatus}.
 * @throws `Error` with a human-readable message if the transition is invalid.
 */
export function assertValidTransition(current: GiftStatus, next: GiftStatus): void {
  if (!isValidTransition(current, next)) {
    throw new Error(
      `Invalid gift status transition: "${current}" → "${next}"`
    );
  }
}
