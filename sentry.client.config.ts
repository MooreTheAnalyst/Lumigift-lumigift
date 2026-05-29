import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Capture replays for 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
  ],

  beforeSend(event) {
    // Strip PII from user context
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },
});
