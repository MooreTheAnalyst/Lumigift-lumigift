/**
 * Analytics module — PostHog integration.
 * Privacy-first: no PII sent, opt-out respected.
 */
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";

export function initAnalytics() {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  if (posthog.__loaded) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // we fire page_view manually
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false, // explicit events only — no accidental PII capture
    sanitize_properties: sanitize,
    loaded: (ph) => {
      if (isOptedOut()) ph.opt_out_capturing();
    },
  });
}

/** Strip any property that looks like PII before sending. */
function sanitize(props: Record<string, unknown>) {
  const BLOCKED = ["email", "phone", "name", "recipient", "message"];
  for (const key of BLOCKED) delete props[key];
  return props;
}

function isOptedOut(): boolean {
  try {
    return localStorage.getItem("analytics_opt_out") === "true";
  } catch {
    return false;
  }
}

export function optOut() {
  try {
    localStorage.setItem("analytics_opt_out", "true");
  } catch {}
  if (typeof window !== "undefined" && posthog.__loaded) posthog.opt_out_capturing();
}

export function optIn() {
  try {
    localStorage.removeItem("analytics_opt_out");
  } catch {}
  if (typeof window !== "undefined" && posthog.__loaded) posthog.opt_in_capturing();
}

// ── Typed event helpers ──────────────────────────────────────────────────────

export function trackPageView(path: string) {
  if (typeof window === "undefined" || !posthog.__loaded) return;
  posthog.capture("page_view", { path });
}

export function trackGiftStarted(templateId?: string) {
  posthog.capture("gift_started", { template_id: templateId });
}

export function trackPaymentInitiated(amountNgn: number) {
  posthog.capture("payment_initiated", { amount_ngn: amountNgn });
}

export function trackGiftCompleted(giftId: string) {
  posthog.capture("gift_completed", { gift_id: giftId });
}

export function trackGiftClaimed(giftId: string) {
  posthog.capture("gift_claimed", { gift_id: giftId });
}

export function trackLogin(method: string) {
  posthog.capture("login", { method });
}
