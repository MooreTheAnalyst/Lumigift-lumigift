import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  // ─── Nigerian formats that must all resolve to the same E.164 ───────────────
  const canonical = "+2348012345678";

  const validNigerianInputs: [string, string][] = [
    ["+2348012345678", canonical],   // already E.164
    ["2348012345678",  canonical],   // international without +
    ["08012345678",    canonical],   // local with leading 0
    ["8012345678",     canonical],   // bare 10-digit
    [" +234 801 234 5678 ", canonical], // spaces stripped
    ["+234-801-234-5678",   canonical], // dashes stripped
  ];

  test.each(validNigerianInputs)(
    "normalizes %s → %s",
    (input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    }
  );

  // ─── Non-Nigerian E.164 numbers should pass through unchanged ───────────────
  it("passes through a valid non-Nigerian E.164 number", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  // ─── Invalid inputs must return null ────────────────────────────────────────
  const invalidInputs = [
    "",
    "0",
    "123",
    "notaphone",
    "00000000000",   // all zeros
    "+0123456789",   // leading zero after +
    "080123456",     // too short (9 digits after 0)
    "080123456789",  // too long (12 digits after 0)
    "12345678901234567", // 17 digits — exceeds E.164 max
  ];

  test.each(invalidInputs)("returns null for invalid input %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  // ─── Zod schema integration ──────────────────────────────────────────────────
  it("verifyOtpSchema normalizes phone to E.164", async () => {
    const { verifyOtpSchema } = await import("@/types/schemas");
    const result = verifyOtpSchema.safeParse({ phone: "08012345678", otp: "123456" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe(canonical);
  });

  it("verifyOtpSchema rejects an invalid phone", async () => {
    const { verifyOtpSchema } = await import("@/types/schemas");
    const result = verifyOtpSchema.safeParse({ phone: "123", otp: "123456" });
    expect(result.success).toBe(false);
  });

  it("createGiftSchema normalizes recipientPhone to E.164", async () => {
    const { createGiftSchema } = await import("@/types/schemas");
    const result = createGiftSchema.safeParse({
      recipientPhone: "08012345678",
      recipientName: "Ada Obi",
      amountNgn: 1000,
      unlockAt: new Date(Date.now() + 86_400_000).toISOString(),
      paymentProvider: "paystack",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recipientPhone).toBe(canonical);
  });
});
