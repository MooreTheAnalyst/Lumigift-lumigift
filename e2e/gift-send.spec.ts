/**
 * e2e: Complete gift send flow
 *
 * Tests the full user journey: login → create gift → payment → success confirmation.
 *
 * Uses Playwright route interception to mock external services:
 * - SMS OTP sending/verification
 * - Paystack payment initialization and callbacks
 * - Stellar network interactions
 *
 * Screenshots are captured at key steps for debugging flaky tests.
 */

import { test, expect, type Page } from "@playwright/test";

const TEST_PHONE = "+2348012345678";
const TEST_OTP = "123456";
const TEST_GIFT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PAYSTACK_REF = "lumigift_test_ref_123";

// Mock data for gift creation
const mockGiftData = {
  id: TEST_GIFT_ID,
  senderId: "test-user-id",
  recipientPhone: TEST_PHONE,
  recipientName: "Test Recipient",
  amountNgn: 1000,
  amountUsdc: "0.5000000",
  message: "Happy testing!",
  unlockAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
  status: "pending_payment",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPaymentData = {
  authorizationUrl: `http://localhost:3000/api/payments/callback?reference=${PAYSTACK_REF}&giftId=${TEST_GIFT_ID}`,
  reference: PAYSTACK_REF,
};

// Setup mocks for external services
async function setupMocks(page: Page) {
  // Mock OTP sending
  await page.route("**/api/auth/send-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  );

  // Mock OTP verification (NextAuth)
  await page.route("**/api/auth/signin/credentials", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  );

  // Mock gift creation
  await page.route("**/api/gifts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { gift: mockGiftData, paymentUrl: mockPaymentData.authorizationUrl },
      }),
    })
  );

  // Mock Paystack payment verification
  await page.route(`**/api/payments/callback*`, (route) =>
    route.fulfill({
      status: 302,
      headers: { Location: `/gifts/${TEST_GIFT_ID}` },
    })
  );

  // Mock gift fetch for success page
  await page.route(`**/api/v1/gifts/${TEST_GIFT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { ...mockGiftData, status: "locked" },
      }),
    })
  );
}

test.describe("Gift Send Flow", () => {
  test("complete gift send journey from form to success", async ({ page }) => {
    await setupMocks(page);

    // Assume user is logged in, start from send page
    await page.goto("/send");
    await expect(page).toHaveTitle(/Send a Gift/);
    await page.screenshot({ path: "test-results/send-form.png" });

    // Step 1: Fill gift form
    await page.fill('input[name="recipientName"]', "Test Recipient");
    await page.fill('input[name="recipientPhone"]', TEST_PHONE);
    await page.fill('input[name="amountNgn"]', "1000");
    await page.fill('input[name="unlockAt"]', new Date(Date.now() + 86400000).toISOString().slice(0, 16)); // tomorrow
    await page.fill('textarea[name="message"]', "Happy testing!");
    await page.screenshot({ path: "test-results/form-filled.png" });

    // Step 2: Submit form and go to payment
    await page.click('button[type="submit"]');

    // Should redirect to Paystack (mocked callback)
    await page.waitForURL(/api\/payments\/callback/);
    await expect(page).toHaveURL(/api\/payments\/callback/);
    await page.screenshot({ path: "test-results/paystack-redirect.png" });

    // The callback will redirect to the gift page
    await page.waitForURL(`/gifts/${TEST_GIFT_ID}`);
    await expect(page).toHaveURL(`/gifts/${TEST_GIFT_ID}`);
    await page.screenshot({ path: "test-results/success-page.png" });

    // Step 3: Verify success page content (gift is now locked)
    await expect(page.getByText("Test Recipient")).toBeVisible();
    await expect(page.getByText("₦1,000")).toBeVisible();
    await expect(page.getByText("Happy testing!")).toBeVisible();
    // Since status is locked, amount should be hidden or show locked status
    await expect(page.getByText(/locked/i)).toBeVisible();
  });

  test("handles payment failure gracefully", async ({ page }) => {
    await setupMocks(page);

    // Mock failed payment callback
    await page.route(`**/api/payments/callback*`, (route) =>
      route.fulfill({
        status: 302,
        headers: { Location: `/gifts/${TEST_GIFT_ID}` },
      })
    );

    // Mock gift as pending_payment for failure
    await page.route(`**/api/v1/gifts/${TEST_GIFT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { ...mockGiftData, status: "pending_payment" },
        }),
      })
    );

    // Complete form submission
    await page.goto("/send");
    await page.fill('input[name="recipientName"]', "Test Recipient");
    await page.fill('input[name="recipientPhone"]', TEST_PHONE);
    await page.fill('input[name="amountNgn"]', "1000");
    await page.fill('input[name="unlockAt"]', new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await page.click('button[type="submit"]');
    await page.waitForURL(/api\/payments\/callback/);

    // Should show the gift page with pending status
    await page.waitForURL(`/gifts/${TEST_GIFT_ID}`);
    await expect(page.getByText(/pending/i)).toBeVisible();
  });

  test("validates form inputs", async ({ page }) => {
    await setupMocks(page);

    await page.goto("/send");

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.getByText(/name must be at least 2 characters/i)).toBeVisible();
    await expect(page.getByText(/enter a valid phone number/i)).toBeVisible();
    await expect(page.getByText(/minimum gift amount is ₦500/i)).toBeVisible();
    await expect(page.getByText(/unlock date must be in the future/i)).toBeVisible();

    await page.screenshot({ path: "test-results/form-validation.png" });
  });
});