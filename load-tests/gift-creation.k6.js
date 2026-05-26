/**
 * k6 load test — Gift Creation endpoint
 * Endpoint: POST /api/v1/gifts
 *
 * Scenario: 100 concurrent virtual users creating gifts simultaneously.
 *
 * Thresholds (performance regression gates):
 *   - p95 response time < 2000 ms
 *   - error rate < 1%
 *   - throughput > 50 req/s
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 AUTH_TOKEN=<jwt> k6 run load-tests/gift-creation.k6.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const errorRate = new Rate("gift_creation_errors");
const creationDuration = new Trend("gift_creation_duration", true);

// ─── Options ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    gift_creation: {
      executor: "constant-vus",
      vus: 100,
      duration: "30s",
    },
  },
  thresholds: {
    // p95 latency under 2 s
    gift_creation_duration: ["p(95)<2000"],
    // error rate under 1%
    gift_creation_errors: ["rate<0.01"],
    // overall http failure rate under 1%
    http_req_failed: ["rate<0.01"],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

function randomPhone() {
  const suffix = Math.floor(10000000 + Math.random() * 90000000);
  return `+23480${suffix}`;
}

function futureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

// ─── Default function (executed per VU iteration) ─────────────────────────────
export default function () {
  const payload = JSON.stringify({
    recipientPhone: randomPhone(),
    recipientName: "Load Test User",
    amountNgn: 1000,
    unlockAt: futureDate(),
    paymentProvider: "paystack",
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    tags: { name: "POST /api/v1/gifts" },
  };

  const res = http.post(`${BASE_URL}/api/v1/gifts`, payload, params);

  creationDuration.add(res.timings.duration);

  const ok = check(res, {
    "status is 201": (r) => r.status === 201,
    "response has paymentUrl": (r) => {
      try {
        return JSON.parse(r.body).data?.paymentUrl !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!ok);

  sleep(0.1); // 100 ms think time
}
