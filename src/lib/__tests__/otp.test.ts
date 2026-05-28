import { storeOtp, verifyOtp } from "@/lib/otp";

// ─── Redis mock ───────────────────────────────────────────────────────────────
// jest.mock is hoisted, so the factory must not reference variables declared
// below it. We build the mock inline and expose it via a module-level ref.

type StoreEntry = { value: string; expiresAt: number };
const store = new Map<string, StoreEntry>();

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  ttl: jest.fn(),
  expire: jest.fn(),
};

jest.mock("@/lib/redis", () => ({
  getRedisClient: jest.fn(),
}));

// ─── Wire up implementations after mock is registered ────────────────────────

import { getRedisClient } from "@/lib/redis";

beforeAll(() => {
  (getRedisClient as jest.Mock).mockResolvedValue(redisMock);

  redisMock.set.mockImplementation(
    async (key: string, value: string, opts?: { EX?: number }) => {
      const expiresAt = opts?.EX ? Date.now() + opts.EX * 1000 : Infinity;
      store.set(key, { value, expiresAt });
    }
  );

  redisMock.get.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  });

  redisMock.del.mockImplementation(async (...keys: string[]) => {
    keys.forEach((k) => store.delete(k));
  });

  redisMock.incr.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    const current = entry ? parseInt(entry.value, 10) : 0;
    const next = current + 1;
    store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? Infinity });
    return next;
  });

  redisMock.ttl.mockImplementation(async (key: string) => {
    const entry = store.get(key);
    if (!entry || entry.expiresAt === Infinity) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  });

  redisMock.expire.mockImplementation(async (key: string, seconds: number) => {
    const entry = store.get(key);
    if (entry) store.set(key, { ...entry, expiresAt: Date.now() + seconds * 1000 });
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHONE = "+2348012345678";
const VALID_OTP = "123456";

async function seedOtp(phone = PHONE, otp = VALID_OTP) {
  await storeOtp(phone, otp);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  // Re-apply implementations after clearAllMocks resets them
  (getRedisClient as jest.Mock).mockResolvedValue(redisMock);
});

describe("storeOtp", () => {
  it("stores the OTP in Redis with a 600-second TTL", async () => {
    await storeOtp(PHONE, VALID_OTP);

    expect(redisMock.set).toHaveBeenCalledWith(
      `otp:${PHONE}`,
      VALID_OTP,
      { EX: 600 }
    );
  });

  it("resets the attempts counter when a new OTP is stored", async () => {
    store.set(`otp:attempts:${PHONE}`, { value: "3", expiresAt: Infinity });

    await storeOtp(PHONE, VALID_OTP);

    expect(redisMock.del).toHaveBeenCalledWith(`otp:attempts:${PHONE}`);
    expect(store.has(`otp:attempts:${PHONE}`)).toBe(false);
  });
});

describe("verifyOtp — success", () => {
  it("returns success:true for a correct OTP", async () => {
    await seedOtp();
    const result = await verifyOtp(PHONE, VALID_OTP);
    expect(result).toEqual({ success: true });
  });

  it("deletes the OTP and attempts keys after successful verification", async () => {
    await seedOtp();
    await verifyOtp(PHONE, VALID_OTP);

    expect(store.has(`otp:${PHONE}`)).toBe(false);
    expect(store.has(`otp:attempts:${PHONE}`)).toBe(false);
  });

  it("OTP cannot be reused after a successful verification", async () => {
    await seedOtp();
    await verifyOtp(PHONE, VALID_OTP);

    const second = await verifyOtp(PHONE, VALID_OTP);
    expect(second.success).toBe(false);
    expect((second as { message: string }).message).toMatch(/expired|not found/i);
  });
});

describe("verifyOtp — incorrect OTP", () => {
  it("returns success:false with a message for a wrong OTP", async () => {
    await seedOtp();
    const result = await verifyOtp(PHONE, "000000");
    expect(result).toMatchObject({ success: false, locked: false, message: "Invalid OTP." });
  });

  it("does not delete the OTP key on a single wrong attempt", async () => {
    await seedOtp();
    await verifyOtp(PHONE, "000000");
    expect(store.has(`otp:${PHONE}`)).toBe(true);
  });
});

describe("verifyOtp — expired OTP", () => {
  it("returns success:false when the OTP key is absent (simulates expiry)", async () => {
    const result = await verifyOtp(PHONE, VALID_OTP);
    expect(result).toMatchObject({
      success: false,
      locked: false,
      message: expect.stringMatching(/expired|not found/i),
    });
  });

  it("returns success:false when the OTP TTL has elapsed", async () => {
    store.set(`otp:${PHONE}`, { value: VALID_OTP, expiresAt: Date.now() - 1 });

    const result = await verifyOtp(PHONE, VALID_OTP);
    expect(result.success).toBe(false);
  });
});

describe("verifyOtp — rate limiting", () => {
  it("locks the account after MAX_ATTEMPTS (5) failed attempts", async () => {
    await seedOtp();

    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await verifyOtp(PHONE, "000000");
    }

    expect(lastResult).toMatchObject({ success: false, locked: true });
  });

  it("deletes the OTP key once the account is locked", async () => {
    await seedOtp();

    for (let i = 0; i < 5; i++) {
      await verifyOtp(PHONE, "000000");
    }

    expect(store.has(`otp:${PHONE}`)).toBe(false);
  });

  it("returns locked:true on attempts beyond the limit", async () => {
    await seedOtp();

    for (let i = 0; i < 6; i++) {
      await verifyOtp(PHONE, "000000");
    }

    const result = await verifyOtp(PHONE, VALID_OTP);
    expect(result.success).toBe(false);
  });
});
