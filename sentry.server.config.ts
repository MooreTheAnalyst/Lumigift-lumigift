import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? process.env.NODE_ENV,

  // Performance traces for API routes
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Capture unhandled promise rejections
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
