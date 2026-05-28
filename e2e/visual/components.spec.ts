/**
 * Visual regression tests for key UI components.
 *
 * Covers: GiftCard (locked, unlocked, claimed states), CreateGiftForm, Navbar.
 * Snapshots are committed to e2e/visual/__snapshots__/.
 *
 * Update snapshots: npm run test:visual:update
 * Closes #107
 */
import { test, expect } from "@playwright/test";

// ─── Navbar ───────────────────────────────────────────────────────────────────

test("Navbar — visual snapshot", async ({ page }) => {
  await page.goto("/");
  const navbar = page.locator("header");
  await expect(navbar).toHaveScreenshot("navbar.png");
});

// ─── CreateGiftForm ───────────────────────────────────────────────────────────

test("CreateGiftForm — visual snapshot", async ({ page }) => {
  await page.goto("/send");
  const form = page.locator("form");
  await expect(form).toHaveScreenshot("create-gift-form.png");
});

// ─── GiftCard states ──────────────────────────────────────────────────────────

/**
 * The gift detail page renders a GiftCard. We use query params to drive state
 * via the test fixture route /gifts/[id] which reads from the seed DB.
 * In CI the seed script runs first, so these IDs are guaranteed to exist.
 */

test("GiftCard — locked state", async ({ page }) => {
  // seed-gift-1 is status=locked (see scripts/seed-test-db.ts)
  await page.goto("/gifts/seed-gift-1");
  const card = page.locator("article").first();
  await expect(card).toHaveScreenshot("gift-card-locked.png");
});

test("GiftCard — unlocked state", async ({ page }) => {
  // seed-gift-2 is status=unlocked
  await page.goto("/gifts/seed-gift-2");
  const card = page.locator("article").first();
  await expect(card).toHaveScreenshot("gift-card-unlocked.png");
});

test("GiftCard — claimed state", async ({ page }) => {
  // seed-gift-3 is status=claimed
  await page.goto("/gifts/seed-gift-3");
  const card = page.locator("article").first();
  await expect(card).toHaveScreenshot("gift-card-claimed.png");
});
