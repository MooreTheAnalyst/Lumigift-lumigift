# ADR-0005: Mobile App Wrapper — Capacitor

**Date:** 2026-05-29  
**Status:** Accepted

## Context

Lumigift is built on Next.js. A significant share of target users (Nigeria, West Africa) primarily access the internet via mobile devices. A native or near-native mobile experience would improve retention, enable push notifications for gift unlock events, and allow distribution through the Play Store and App Store.

Two approaches were evaluated:

| Dimension | Capacitor | React Native |
|-----------|-----------|--------------|
| Code reuse | Wraps the existing Next.js web app — near-zero frontend rewrite | Requires a separate React Native codebase sharing only business logic |
| Time to prototype | 1–2 days to bundle and run on an emulator | 2–4 weeks to re-implement core flows |
| Web feature parity | All web features available immediately via WebView | Each feature must be ported or implemented twice |
| Native performance | WebView performance; acceptable for a gift/fintech CRUD app | Full native rendering; better for heavy animation or complex lists |
| Push notifications | Via `@capacitor/push-notifications` (FCM/APNs) | Via `react-native-firebase` or Expo Notifications |
| Deep links | Supported via universal links / Android App Links | Supported natively |
| Offline support | Limited; requires a PWA/Service Worker layer | Easier with react-query + AsyncStorage |
| Plugin ecosystem | Growing; covers the features Lumigift needs | Mature; broader community |
| Team expertise | Existing TypeScript/React skills apply directly | Requires learning the React Native + Metro bundler toolchain |
| Maintenance overhead | One codebase (the web app) | Two codebases diverge over time |
| App Store approval | Historically Apple scrutinises WebView-only wrappers | Native apps have fewer approval friction points |

Lumigift's core flows (login with phone OTP, send a gift, view dashboard, claim a gift) are CRUD-centric with no heavy native animation requirements. The team is small (< 5 engineers) and the priority is shipping a usable mobile app without a large rewrite investment.

## Decision

Use **Capacitor** (v6) to wrap the existing Next.js application for iOS and Android.

A dedicated `capacitor.config.ts` points Capacitor's WebView at the Next.js server (or a static export for production). The following Capacitor plugins will be integrated:

| Plugin | Purpose |
|--------|---------|
| `@capacitor/push-notifications` | Gift unlock and received notifications via FCM (Android) + APNs (iOS) |
| `@capacitor/app` | Handle deep links (`lumigift://gifts/:id`) for gift claim pages |
| `@capacitor/haptics` | Tactile feedback on gift reveal |
| `@capacitor/status-bar` | Match status bar style to app theme |
| `@capacitor/splash-screen` | Branded splash on launch |

Push notification tokens will be stored against the user record and used to deliver `gift_received` and `gift_unlocked` events from the existing notification service.

## Consequences

### Positive
- Zero frontend rewrite — all 40+ screens work immediately.
- Team can ship an app store prototype within a sprint.
- A single codebase means web and mobile features stay in sync automatically.
- Push notification integration is straightforward with `@capacitor/push-notifications`.

### Negative
- Apple App Store may require additional justification for WebView-based apps; the submission must demonstrate native value (push notifications, deep links, offline resilience) beyond a website shortcut.
- WebView performance is not suitable if the product evolves toward complex native animations (e.g., gift-reveal confetti, card-flip animations at 60 fps). If that becomes a requirement, a hybrid approach (Capacitor shell + native screens for key flows) should be re-evaluated.
- Memory overhead is higher than a native app because a full browser engine runs inside the app.

### Neutral
- The Stellar/Soroban contract interactions happen via existing API routes, so no mobile-specific blockchain client is needed.
- Future migration to React Native remains possible; Capacitor and React Native are not mutually exclusive deployment targets.

## Alternatives Considered

| Option | Reason Not Chosen |
|--------|------------------|
| React Native (bare) | 2–4 week rewrite of all screens; creates a second codebase to maintain; no meaningful user-facing benefit for Lumigift's current feature set |
| Expo (managed workflow) | Expo manages the native layer but still requires React Native; same rewrite cost applies |
| Progressive Web App only | iOS severely limits PWA push notifications (background delivery unreliable before iOS 17+); no App Store discoverability |
| Flutter | Requires Dart; entirely new language and framework for the team; no code reuse |

## Implementation Plan

1. `npm install @capacitor/core @capacitor/cli` — add Capacitor to the existing Next.js project.
2. `npx cap init Lumigift com.lumigift.app` — initialise `capacitor.config.ts`.
3. Configure `server.url` to point at `https://app.lumigift.com` for production builds; use `http://localhost:3000` for dev.
4. `npx cap add android && npx cap add ios` — scaffold native projects.
5. Integrate `@capacitor/push-notifications`; update the notification service to call the FCM/APNs token registration endpoint on login.
6. Register Android App Links and Apple Universal Links for `lumigift.com/gifts/:id`.
7. Submit to Google Play (internal testing track) → gather feedback → submit to App Store (TestFlight).

## References

- [Capacitor docs](https://capacitorjs.com/docs)
- [Capacitor Push Notifications plugin](https://capacitorjs.com/docs/apis/push-notifications)
- [Apple WebView App Store guidelines (2.3.1, 4.2)](https://developer.apple.com/app-store/review/guidelines/)
