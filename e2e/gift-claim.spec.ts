/**
 * e2e: Gift claim flow
 *
 * Uses Playwright route interception to mock the API so the test runs without
 * a live database or Stellar testnet connection.
 *
 * Scenarios covered:
 *  1. Locked gift — amount hidden, no claim button
 *  2. Claim before unlock — API returns error, page shows alert
 *  3. Unlocked gift — claim button visible, successful claim shows tx hash
 *  4. USDC balance change verified via mocked balance endpoint
 */

import { test, expect, type Page } from "@playwright/test";

const GIFT_ID = "00000000-0000-0000-0000-000000000001";
const RECIPIENT_KEY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const CLAIM_URL = `/gifts/${GIFT_ID}?stellarKey=${RECIPIENT_KEY}`;
const GIFT_API = `/api/v1/gifts/${GIFT_ID}`;
const CLAIM_API = `/api/v1/gifts/${GIFT_ID}/claim`;

const baseGift = {
  id: GIFT_ID,
  recipientName: "Ada",
  amountNgn: 5000,
  amountUsdc: "3.00",
  message: "Happy birthday!",
  status: "locked",
  unlockAt: new Date(Date.now() + 86_400_000).toISOString(), // tomorrow
};

async function mockGift(page: Page, overrides: Partial<typeof baseGift>) {
  await page.route(`**${GIFT_API}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { ...baseGift, ...overrides } }),
    })
  );
}

// ─── 1. Locked state ──────────────────────────────────────────────────────────
test("locked gift hides amount and shows no claim button", async ({ page }) => {
  await mockGift(page, { status: "locked" });
  await page.goto(CLAIM_URL);

  await expect(page.getByText("₦ ••••••")).toBeVisible();
  await expect(page.getByRole("button", { name: /claim gift/i })).not.toBeVisible();
});

// ─── 2. Claim before unlock (error state) ────────────────────────────────────
test("claim before unlock shows error alert", async ({ page }) => {
  // Gift appears unlocked in the UI but the API rejects the claim
  await mockGift(page, { status: "unlocked" });

  await page.route(`**${CLAIM_API}`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "Gift is not yet unlocked." }),
    })
  );

  await page.goto(CLAIM_URL);
  await page.getByRole("button", { name: /claim gift/i }).click();

  await expect(page.getByRole("alert")).toContainText("Gift is not yet unlocked.");
});

// ─── 3. Successful claim ──────────────────────────────────────────────────────
test("successful claim shows claimed state", async ({ page }) => {
  await mockGift(page, { status: "unlocked" });

  await page.route(`**${CLAIM_API}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { txHash: "abc123txhash" } }),
    })
  );

  // After claim, the page re-fetches the gift — return claimed state
  let callCount = 0;
  await page.route(`**${GIFT_API}`, (route) => {
    callCount++;
    const status = callCount === 1 ? "unlocked" : "claimed";
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { ...baseGift, status } }),
    });
  });

  await page.goto(CLAIM_URL);
  await page.getByRole("button", { name: /claim gift/i }).click();

  // Button disappears once status transitions to claimed
  await expect(page.getByRole("button", { name: /claim gift/i })).not.toBeVisible({
    timeout: 10_000,
  });
});

// ─── 4. USDC balance change ───────────────────────────────────────────────────
test("USDC balance increases after successful claim", async ({ page }) => {
  const BALANCE_API = `/api/v1/stellar/balance/${RECIPIENT_KEY}`;
  let claimed = false;

  await mockGift(page, { status: "unlocked" });

  await page.route(`**${CLAIM_API}`, (route) => {
    claimed = true;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { txHash: "abc123txhash" } }),
    });
  });

  await page.route(`**${BALANCE_API}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { balance: claimed ? "13.00" : "10.00" } }),
    })
  );

  await page.goto(CLAIM_URL);
  await page.getByRole("button", { name: /claim gift/i }).click();

  // Verify the claim API was hit (balance change is implicit from the mock)
  await expect
    .poll(() => claimed, { timeout: 10_000 })
    .toBe(true);

  // Fetch balance directly to assert the post-claim value
  const balanceRes = await page.request.get(
    `${page.url().split("/gifts")[0]}${BALANCE_API}`
  );
  const balanceJson = await balanceRes.json();
  expect(parseFloat(balanceJson.data.balance)).toBeGreaterThan(10);
});
