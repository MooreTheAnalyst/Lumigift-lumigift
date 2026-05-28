import { expect, test } from "@playwright/test";

test.describe("@smoke post-deployment checks", () => {
  test.describe.configure({ timeout: 30_000 });

  test("app loads", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: /cash gifts that unlock/i })).toBeVisible();
  });

  test("/api/health returns 200", async ({ request }) => {
    const response = await request.get("/api/health", { timeout: 10_000 });

    expect(response.status()).toBe(200);
    await expect(response).toBeOK();
  });

  test("login page renders", async ({ page }) => {
    const response = await page.goto("/auth/login", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: /sign in to lumigift/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /phone/i })).toBeVisible();
  });

  test("gift creation form loads", async ({ page }) => {
    const response = await page.goto("/send", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: /choose an occasion/i })).toBeVisible();

    await page.getByRole("button", { name: /custom/i }).click();
    await expect(page.getByRole("heading", { name: /who is this gift for/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /recipient's name/i })).toBeVisible();
  });
});
