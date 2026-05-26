/**
 * k6 combined load test — Gift Creation + Claim (full flow)
 *
 * Runs both scenarios in parallel:
 *   - 100 VUs creating gifts for 30 s
 *   - 50 VUs claiming pre-seeded gifts for 30 s
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 AUTH_TOKEN=<jwt> GIFT_IDS=id1,id2 STELLAR_KEY=G... \
 *     k6 run load-tests/combined.k6.js --out json=load-tests/results/run-$(date +%s).json
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const creationErrors = new Rate("gift_creation_errors");
const claimErrors = new Rate("gift_claim_errors");
const creationDuration = new Trend("gift_creation_duration", true);
const claimDuration = new Trend("gift_claim_duration", true);

// ─── Options ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    gift_creation: {
      executor: "constant-vus",
      vus: 100,
      duration: "30s",
      exec: "createGift",
    },
    gift_claim: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      exec: "claimGift",
    },
  },
  thresholds: {
    gift_creation_duration: ["p(95)<2000"],
    gift_claim_duration: ["p(95)<3000"],
    gift_creation_errors: ["rate<0.01"],
    gift_claim_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

// ─── Shared config ────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const STELLAR_KEY =
  __ENV.STELLAR_KEY || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const GIFT_IDS = (__ENV.GIFT_IDS || "").split(",").filter(Boolean);

function randomPhone() {
  const suffix = Math.floor(10000000 + Math.random() * 90000000);
  return `+23480${suffix}`;
}

function futureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

// ─── Scenario: create gift ────────────────────────────────────────────────────
export function createGift() {
  const payload = JSON.stringify({
    recipientPhone: randomPhone(),
    recipientName: "Load Test User",
    amountNgn: 1000,
    unlockAt: futureDate(),
    paymentProvider: "paystack",
  });

  const res = http.post(`${BASE_URL}/api/v1/gifts`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: "POST /api/v1/gifts" },
  });

  creationDuration.add(res.timings.duration);
  const ok = check(res, { "gift created (201)": (r) => r.status === 201 });
  creationErrors.add(!ok);
  sleep(0.1);
}

// ─── Scenario: claim gift ─────────────────────────────────────────────────────
export function claimGift() {
  if (GIFT_IDS.length === 0) return;

  const giftId = GIFT_IDS[__VU % GIFT_IDS.length];
  const payload = JSON.stringify({ giftId, recipientStellarKey: STELLAR_KEY });

  const res = http.post(`${BASE_URL}/api/v1/gifts/${giftId}/claim`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST /api/v1/gifts/:id/claim" },
  });

  claimDuration.add(res.timings.duration);
  const ok = check(res, { "gift claimed (200)": (r) => r.status === 200 });
  claimErrors.add(!ok);
  sleep(0.2);
}
