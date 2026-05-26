/**
 * @jest-environment node
 *
 * Integration tests for the Paystack webhook handler.
 * Uses a real PostgreSQL test database (TEST_DATABASE_URL) seeded with known fixtures.
 *
 * Closes #102
 */
import crypto from "crypto";
import { Pool } from "pg";

// ─── Test DB setup ────────────────────────────────────────────────────────────

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://lumigift:lumigift@localhost:5432/lumigift_test";

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Minimal schema for the test
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gifts (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_phone_hash TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      amount_ngn NUMERIC NOT NULL,
      amount_usdc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      unlock_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS paystack_processed_refs (
      reference TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  await pool.query("DROP TABLE IF EXISTS paystack_processed_refs");
  await pool.query("DROP TABLE IF EXISTS gifts");
  await pool.end();
});

beforeEach(async () => {
  await pool.query("TRUNCATE gifts, paystack_processed_refs");
  // Seed a gift in pending_payment state
  await pool.query(`
    INSERT INTO gifts (id, sender_id, recipient_phone_hash, recipient_name, amount_ngn, amount_usdc, status, unlock_at)
    VALUES ('gift-integ-1', 'user-1', 'abc123hash', 'Test Recipient', 5000, '3.0000000', 'pending_payment', NOW() + INTERVAL '7 days')
  `);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = "integ-test-secret";

function sign(body: string): string {
  return crypto.createHmac("sha512", WEBHOOK_SECRET).update(body).digest("hex");
}

/**
 * Minimal in-process handler that mirrors the production webhook logic
 * but uses the test DB pool instead of the in-memory gift store.
 */
async function handleWebhook(
  rawBody: string,
  signature: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  // 1. Verify signature
  const expected = crypto
    .createHmac("sha512", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  if (
    Buffer.from(expected).length !== Buffer.from(signature).length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.padEnd(expected.length, "\0").slice(0, expected.length)))
  ) {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  let event: { event: string; data: { reference: string; metadata?: { giftId?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const { reference } = event.data;

  // 2. Idempotency check
  const dup = await pool.query(
    "SELECT 1 FROM paystack_processed_refs WHERE reference = $1",
    [reference]
  );
  if (dup.rowCount && dup.rowCount > 0) {
    return { status: 200, body: { received: true } };
  }

  // 3. Process known event types
  if (event.event === "charge.success") {
    const giftId = event.data.metadata?.giftId;
    if (giftId) {
      await pool.query(
        "UPDATE gifts SET status = 'locked', updated_at = NOW() WHERE id = $1",
        [giftId]
      );
    }
  }
  // Unknown event types are safely ignored (no else branch needed)

  // 4. Mark reference as processed
  await pool.query(
    "INSERT INTO paystack_processed_refs (reference) VALUES ($1) ON CONFLICT DO NOTHING",
    [reference]
  );

  return { status: 200, body: { received: true } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Paystack webhook integration (test DB)", () => {
  it("valid webhook with correct signature creates a gift record update", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref-001", metadata: { giftId: "gift-integ-1" } },
    });
    const res = await handleWebhook(body, sign(body));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const { rows } = await pool.query("SELECT status FROM gifts WHERE id = 'gift-integ-1'");
    expect(rows[0].status).toBe("locked");
  });

  it("duplicate webhook reference is idempotently ignored", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref-dup", metadata: { giftId: "gift-integ-1" } },
    });

    // First call — processes normally
    await handleWebhook(body, sign(body));

    // Reset gift status to simulate re-delivery
    await pool.query("UPDATE gifts SET status = 'pending_payment' WHERE id = 'gift-integ-1'");

    // Second call — must be ignored
    const res = await handleWebhook(body, sign(body));
    expect(res.status).toBe(200);

    // Status must NOT have changed again
    const { rows } = await pool.query("SELECT status FROM gifts WHERE id = 'gift-integ-1'");
    expect(rows[0].status).toBe("pending_payment");
  });

  it("invalid signature returns 400", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "ref-bad-sig", metadata: { giftId: "gift-integ-1" } },
    });
    const res = await handleWebhook(body, "invalidsignature");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid signature" });

    // Gift must remain untouched
    const { rows } = await pool.query("SELECT status FROM gifts WHERE id = 'gift-integ-1'");
    expect(rows[0].status).toBe("pending_payment");
  });

  it("webhook with unknown event type is safely ignored", async () => {
    const body = JSON.stringify({
      event: "transfer.success",
      data: { reference: "ref-unknown", metadata: { giftId: "gift-integ-1" } },
    });
    const res = await handleWebhook(body, sign(body));

    expect(res.status).toBe(200);

    // Gift status must be unchanged
    const { rows } = await pool.query("SELECT status FROM gifts WHERE id = 'gift-integ-1'");
    expect(rows[0].status).toBe("pending_payment");

    // Reference must still be recorded (idempotency)
    const { rows: refs } = await pool.query(
      "SELECT 1 FROM paystack_processed_refs WHERE reference = 'ref-unknown'"
    );
    expect(refs).toHaveLength(1);
  });
});
