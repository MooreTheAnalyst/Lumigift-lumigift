/**
 * Typed Soroban contract event shapes for the Lumigift escrow contract.
 *
 * The contract emits:
 *
 *   gift_created   → topic: ["gift_created", gift_id]
 *                    data:  (sender: Address, recipient: Address, amount: i128, unlock_time: u64, ts: u64)
 *
 *   gift_claimed   → topic: ["gift_claimed", gift_id]
 *                    data:  (recipient: Address, amount: i128, ts: u64)
 *
 *   gift_cancelled → topic: ["gift_cancelled", gift_id]
 *                    data:  (sender: Address, amount: i128, ts: u64)
 *
 *   gift_expired   → topic: ["gift_expired", gift_id]
 *                    data:  (sender: Address, amount: i128, ts: u64)
 */

import {
  rpc as SorobanRpc,
  Address,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// ─── Event type discriminants ─────────────────────────────────────────────────

export type EscrowEventType =
  | "gift_created"
  | "gift_claimed"
  | "gift_cancelled"
  | "gift_expired"
  | "admin_changed"
  | "upgraded";

// ─── Typed event payloads ─────────────────────────────────────────────────────

export interface GiftCreatedEvent {
  type: "gift_created";
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  giftId: string;
  sender: string;
  recipient: string;
  amount: bigint;
  unlockTime: bigint;
  timestamp: bigint;
}

export interface GiftClaimedEvent {
  type: "gift_claimed";
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  giftId: string;
  recipient: string;
  amount: bigint;
  timestamp: bigint;
}

export interface GiftCancelledEvent {
  type: "gift_cancelled";
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  giftId: string;
  sender: string;
  amount: bigint;
  timestamp: bigint;
}

export interface GiftExpiredEvent {
  type: "gift_expired";
  contractId: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  giftId: string;
  sender: string;
  amount: bigint;
  timestamp: bigint;
}

export type EscrowEvent =
  | GiftCreatedEvent
  | GiftClaimedEvent
  | GiftCancelledEvent
  | GiftExpiredEvent;

// ─── Cursor helpers ───────────────────────────────────────────────────────────

/** Sentinel cursor meaning "start from the beginning of the ledger history". */
export const CURSOR_GENESIS = "0000000000000000-0000000000";

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export interface FetchEventsOptions {
  rpcUrl: string;
  contractId: string;
  /** Exclusive start cursor — fetch events *after* this cursor. */
  startCursor: string;
  /** Maximum number of events to return per call (Soroban RPC max is 10 000). */
  limit?: number;
}

export interface FetchEventsResult {
  events: EscrowEvent[];
  /** Cursor of the last event returned; pass as `startCursor` on the next call. */
  latestCursor: string;
}

/**
 * Fetches Soroban contract events for the escrow contract from the RPC node,
 * starting after `startCursor`.
 */
export async function fetchEscrowEvents(
  opts: FetchEventsOptions
): Promise<FetchEventsResult> {
  const rpc = new SorobanRpc.Server(opts.rpcUrl, { allowHttp: false });

  const isGenesis = opts.startCursor === CURSOR_GENESIS;

  // stellar-sdk v15: GetEventsRequest is either ledger-range or cursor mode
  const request: SorobanRpc.Api.GetEventsRequest = isGenesis
    ? {
        filters: [
          {
            type: "contract",
            contractIds: [opts.contractId],
            topics: [["*"]],
          },
        ],
        startLedger: 0,
        limit: opts.limit ?? 200,
      }
    : {
        filters: [
          {
            type: "contract",
            contractIds: [opts.contractId],
            topics: [["*"]],
          },
        ],
        cursor: opts.startCursor,
        limit: opts.limit ?? 200,
      };

  const response = await rpc.getEvents(request);

  const events: EscrowEvent[] = [];
  let latestCursor = opts.startCursor;

  for (const raw of response.events) {
    const parsed = parseEventResponse(raw);
    if (parsed) {
      events.push(parsed);
      // Use the event id as cursor (stellar-sdk v15 uses id for pagination)
      latestCursor = raw.id;
    }
  }

  // If the response has a cursor field, prefer it
  if (response.cursor && response.cursor !== opts.startCursor) {
    latestCursor = response.cursor;
  }

  return { events, latestCursor };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseEventResponse(
  raw: SorobanRpc.Api.EventResponse
): EscrowEvent | null {
  if (!raw.topic?.length) return null;

  const eventName = scValToNative(raw.topic[0]) as string;
  const giftId = raw.topic.length > 1 ? (scValToNative(raw.topic[1]) as string) : "";
  const dataVal = raw.value;

  const contractId = raw.contractId?.toString() ?? "";

  const base = {
    contractId,
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    txHash: raw.txHash,
    giftId,
  };

  try {
    switch (eventName) {
      case "gift_created":
        return decodeGiftCreatedEvent(base, dataVal);
      case "gift_claimed":
        return decodeGiftClaimedEvent(base, dataVal);
      case "gift_cancelled":
        return decodeGiftCancelledEvent(base, dataVal);
      case "gift_expired":
        return decodeGiftExpiredEvent(base, dataVal);
      case "initialized": // Backward compatibility
        return decodeLegacyInitializedEvent(base, dataVal);
      case "claimed": // Backward compatibility
        return decodeLegacyClaimedEvent(base, dataVal);
      case "cancelled": // Backward compatibility
        return decodeLegacyCancelledEvent(base, dataVal);
    }
  } catch (err) {
    console.warn("[escrow-events] failed to decode event", eventName, err);
  }

  return null;
}

function decodeGiftCreatedEvent(
  base: Omit<GiftCreatedEvent, "type" | "sender" | "recipient" | "amount" | "unlockTime" | "timestamp">,
  data: xdr.ScVal
): GiftCreatedEvent {
  const items = data.vec();
  if (!items || items.length !== 5) throw new Error("unexpected gift_created data shape");
  const [senderVal, recipientVal, amountVal, unlockTimeVal, tsVal] = items;
  return {
    ...base,
    type: "gift_created",
    sender: Address.fromScVal(senderVal).toString(),
    recipient: Address.fromScVal(recipientVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    unlockTime: BigInt(scValToNative(unlockTimeVal) as number | bigint),
    timestamp: BigInt(scValToNative(tsVal) as number | bigint),
  };
}

function decodeGiftClaimedEvent(
  base: Omit<GiftClaimedEvent, "type" | "recipient" | "amount" | "timestamp">,
  data: xdr.ScVal
): GiftClaimedEvent {
  const items = data.vec();
  if (!items || items.length !== 3) throw new Error("unexpected gift_claimed data shape");
  const [recipientVal, amountVal, tsVal] = items;
  return {
    ...base,
    type: "gift_claimed",
    recipient: Address.fromScVal(recipientVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    timestamp: BigInt(scValToNative(tsVal) as number | bigint),
  };
}

function decodeGiftCancelledEvent(
  base: Omit<GiftCancelledEvent, "type" | "sender" | "amount" | "timestamp">,
  data: xdr.ScVal
): GiftCancelledEvent {
  const items = data.vec();
  if (!items || items.length !== 3) throw new Error("unexpected gift_cancelled data shape");
  const [senderVal, amountVal, tsVal] = items;
  return {
    ...base,
    type: "gift_cancelled",
    sender: Address.fromScVal(senderVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    timestamp: BigInt(scValToNative(tsVal) as number | bigint),
  };
}

function decodeGiftExpiredEvent(
  base: Omit<GiftExpiredEvent, "type" | "sender" | "amount" | "timestamp">,
  data: xdr.ScVal
): GiftExpiredEvent {
  const items = data.vec();
  if (!items || items.length !== 3) throw new Error("unexpected gift_expired data shape");
  const [senderVal, amountVal, tsVal] = items;
  return {
    ...base,
    type: "gift_expired",
    sender: Address.fromScVal(senderVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    timestamp: BigInt(scValToNative(tsVal) as number | bigint),
  };
}

// ─── Legacy decoders ──────────────────────────────────────────────────────────

function decodeLegacyInitializedEvent(
  base: any,
  data: xdr.ScVal
): GiftCreatedEvent {
  const items = data.vec();
  if (!items || items.length !== 4) throw new Error("unexpected initialized data shape");
  const [senderVal, recipientVal, amountVal, unlockTimeVal] = items;
  return {
    ...base,
    type: "gift_created",
    sender: Address.fromScVal(senderVal).toString(),
    recipient: Address.fromScVal(recipientVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    unlockTime: BigInt(scValToNative(unlockTimeVal) as number | bigint),
    timestamp: BigInt(0),
  };
}

function decodeLegacyClaimedEvent(
  base: any,
  data: xdr.ScVal
): GiftClaimedEvent {
  const items = data.vec();
  if (!items || items.length !== 2) throw new Error("unexpected claimed data shape");
  const [recipientVal, amountVal] = items;
  return {
    ...base,
    type: "gift_claimed",
    recipient: Address.fromScVal(recipientVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    timestamp: BigInt(0),
  };
}

function decodeLegacyCancelledEvent(
  base: any,
  data: xdr.ScVal
): GiftCancelledEvent {
  const items = data.vec();
  if (!items || items.length !== 2) throw new Error("unexpected cancelled data shape");
  const [senderVal, amountVal] = items;
  return {
    ...base,
    type: "gift_cancelled",
    sender: Address.fromScVal(senderVal).toString(),
    amount: BigInt(scValToNative(amountVal) as number | bigint),
    timestamp: BigInt(0),
  };
}
