# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Nouri is an AI-assisted nutrition/health-tracking PWA built as a personal project (mobile-first, iOS-style UI). It's a React + TypeScript + Vite app with no backend of its own — it talks directly to Firebase (auth + profile storage) and OpenAI (AI features) from the client.

## Commands

```bash
npm run dev       # start Vite dev server
npm run build      # tsc -b (project references) then vite build — build fails on any TS error, including unused locals/params
npm run lint       # eslint .
npm run preview    # preview a production build locally
npm test           # vitest run — unit/regression tests for pure logic (src/**/*.test.ts)
npm run test:watch # vitest in watch mode
npm run test:e2e   # playwright test — full E2E flow against a real throwaway Firebase account (see below)
```

## Testing

**Unit/regression tests** (`src/lib/*.test.ts`, run via Vitest) cover pure logic only — `nutrition.ts` (BMR/TDEE/macro math, `calibrateTarget`), `format.ts`, `weighIn.ts`. No component/rendering tests exist; UI logic that matters is kept in small pure functions specifically so it's unit-testable (e.g. `getProgressCaption` in `nutrition.ts`, `computeWeighInStatus` in `weighIn.ts`) rather than inlined as JSX ternaries. When you find a real bug in one of these functions, add a regression test alongside the fix — `nutrition.test.ts` and `weighIn.test.ts` already have precedent (`// REGRESE:` comments) for two bugs found in the wild: the seed/manual weigh-in misclassification and the "Skvělé tempo" caption showing at 0 logged calories.

**E2E test** (`e2e/calibration.spec.ts`, run via Playwright) exercises the full adaptive-calibration flow against the **real production Firebase project** (`nouri-70d9e`) — there are no Firebase emulators configured. It registers a throwaway email/password test account (`e2e-calibration-<timestamp>@example.com`, never Google OAuth — no risk of colliding with a real saved Google session), completes onboarding, seeds 21 days of synthetic weight/meal history directly through the app's own exported functions (`logWeight`, `db.meals.add`) via `page.evaluate` + dynamic `import()` of the served source modules (Vite dev server serves raw ES modules, so `await import("/src/lib/cloudSync.ts")` works from an injected script — bare specifiers like `"firebase/firestore"` do *not* resolve this way, only same-origin file paths do), asserts the calibration card and its effects, then deletes the account and all its data (Firestore REST API + local Dexie) in a `finally` block. Expected values are computed by importing the real `calculateNutrition`/`calibrateTarget` functions directly into the Node-side test file, not hardcoded — the test stays correct if the formula or thresholds change. Costs a small real OpenAI call (`gpt-4o-mini`, via the deployed `getDailyGreeting` function firing on Home mount) each run — not wired into `build`/`lint`, run it deliberately.

## Environment

Client-side `.env` variables (Vite `VITE_*` convention, read via `import.meta.env`):

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — Firebase config (`src/lib/firebase.ts`)

These keys are bundled into the client build (Vite exposes `VITE_*` vars publicly) — this is a known/accepted tradeoff for this project, not an oversight to "fix." The OpenAI key is **not** among them (see below) — it lives server-side only.

Server-side secret (Firebase Secret Manager, not in any `.env` the client reads):

- `OPENAI_API_KEY` — set via `firebase functions:secrets:set OPENAI_API_KEY`, consumed only inside `functions/src/index.ts` (Cloud Functions), never shipped to the browser.

## 🚀 Hlavní mandáty (Zkratky)

- **ND (Nic Nedělej)**: Pouze analýza a návrhy. Nesmí modifikovat žádné soubory. STRIKTNE DODRZOVAT,NEOBCHAZET PRAVIDLO!!!
- **SP (Smart Publish)**: Proces vydání verze (SemVer -> CHANGELOG.md -> package.json -> git push).
- **SC (Smart Commit)**: soucasna verze je v ./package.json. Analýza změn -> Conventional Commit s českým popisem -> `git add .` -> `git commit`.
  zadny z mandatu nedelat svevolne, jenom na vyzadani!

# Architecture

**Data has two separate stores with different roles — don't conflate them:**

- **Firebase Firestore** (`src/lib/firebase.ts`) holds the `UserProfile` (one doc per user at `users/{uid}`): identity, body metrics, goals, and the cached AI report. Read/written exclusively through `AuthContext`.
- **Dexie/IndexedDB** (`src/db/db.ts`, table `meals`) holds locally-logged food entries, queried live via `dexie-react-hooks`' `useLiveQuery`. This is a fast local **cache** kept in sync with Firestore (`users/{uid}/meals`, source of truth) by a live `onSnapshot` listener (`subscribeMeals` in `src/lib/cloudSync.ts`, started in `App.tsx`) — not an independent local-only store. The listener upserts/deletes rows by `syncId` (not Dexie's local `id`) so it never duplicates a meal the client just wrote itself. Weight history (`users/{uid}/weightLogs`) has no local cache — `subscribeWeightLogs` streams straight into React state in `Stats.tsx`/`App.tsx`. Firestore is initialized with `persistentLocalCache` + `persistentMultipleTabManager` (`src/lib/firebase.ts`) so writes made offline queue and flush automatically on reconnect, and multiple open tabs/devices share one persistence layer.

**Auth and profile are unified in one context.** `src/context/AuthContext.tsx` wraps Firebase Auth's `onAuthStateChanged` and fetches/writes the matching Firestore profile doc together, exposing `{ user, profile, loading, updateProfile, logout }` via `useAuth()`. `updateProfile` does an optimistic local merge + `setDoc(..., { merge: true })`. `App.tsx` gates the whole app on `user` and `profile.setupComplete`: if either is missing, it renders `Onboarding` instead of the main tab UI.

**Theming is class-based via a second context.** `src/context/ThemeContext.tsx` manages `light`/`dark`/`system`, persisted to `localStorage`, applied by toggling a `.dark` class on `<html>`. Tailwind v4 is configured with `@custom-variant dark (&:where(.dark, .dark *))` in `src/index.css` (not the default media-query strategy), so dark-mode styling depends on that class, not `prefers-color-scheme` directly.

**Gender drives a second layer of theming independent of dark/light.** Throughout the app (`App.tsx`, `Onboarding.tsx`, `Profile.tsx`), `profile.gender` selects an accent (rose for female, sky/blue for male) applied to backgrounds and highlight colors — this is layered on top of, not a replacement for, the light/dark theme.

**AI ("Mya") calls OpenAI through a Firebase Cloud Functions proxy — never directly from the client.** `functions/src/index.ts` defines three `onCall` functions (`generateWelcomeReport`, `getDailyGreeting`, `analyzeFood`), each gated on `request.auth` (rejects unauthenticated callers) and holding `OPENAI_API_KEY` via `defineSecret` from Firebase Secret Manager. `src/lib/ai.ts` (`MyaAI.generateWelcomeReport`, `MyaAI.getDailyGreeting`) and `src/lib/vision.ts` (`MyaVision.analyzeFood`) are thin client wrappers around `httpsCallable(functions, ...)` — they hold no API key and no prompt text. Text functions use `gpt-4o-mini`, `analyzeFood` uses `gpt-4o` (vision). Both `ai.ts` functions degrade gracefully with hardcoded Czech fallback strings if the callable throws (network/infra failure) — separately, each Cloud Function has its *own* internal fallback if OpenAI itself errors/429s, so a client-visible fallback can come from either layer. `getDailyGreeting` results are cached per-day client-side in `sessionStorage` (key `mya_greeting_{date}`) to limit calls. `REFERENCE/FEATURE_IDEAS.md` (gitignored, local-only) is the working feature backlog — check its `Hotovo`/`Zamítnuto` sections before assuming a feature is unimplemented vs. already shipped or intentionally rejected. `REFERENCE/done/IMPLEMENTATION_PLAN.md` holds the earlier (through v0.11.0) architecture/roadmap history, archived once its planned phases were complete.

**Deploying the Functions backend:** `functions/` is a separate TypeScript project (`npm run build` there compiles to `functions/lib/`). `firebase deploy --only functions` deploys all three from the repo root (needs `firebase.json` + `.firebaserc`, project `nouri-70d9e`, Blaze plan required for Secret Manager + outbound network calls). Changing the OpenAI key: `firebase functions:secrets:set OPENAI_API_KEY` (prompts for the value, never pass it via a scripted command) — it auto-offers to redeploy the three functions onto the new secret version.

**Nutrition math is deterministic and separate from AI.** `src/lib/nutrition.ts` computes BMR (Mifflin-St Jeor), TDEE, calorie targets, and macro splits from profile data — pure functions, no API calls. `MyaAI.generateWelcomeReport` calls this first and feeds the numbers into the LLM prompt; `Profile.tsx` also calls it directly to render live BMR/TDEE metric tiles without waiting on AI.

**Single-page shell, not a router.** `App.tsx` holds `activeTab` in local `useState` and switches between `Home` / `Stats` / `Recipes` / `Profile` (`src/features/*.tsx`) — there is no `react-router` or URL-based navigation. The layout is a fixed-width mobile shell (`max-w-md`, `h-dvh`) centered on the page, with a sticky header, scrollable content, and a bottom tab bar (`BottomNav.tsx`) — desktop viewports just show letterboxing around the mobile frame.

**All user-facing text and AI prompts are in Czech.** This is a deliberate product decision (personal app for the author's wife), not an i18n gap — don't add translation infrastructure unprompted.

## Notable constraints

- `tsconfig.app.json` has `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax` enabled, and `npm run build` runs `tsc -b` before `vite build` — unused imports or non-`type`-only imports of types will fail the build (this has broken Vercel deploys before per `CHANGELOG.md`).
- The AI system prompt in `generateWelcomeReport` explicitly forbids markdown tables (unreadable on mobile) in favor of `###` headers and bullet lists — `Profile.tsx`'s report renderer (`lastAiReport.split('\n')`) only knows how to parse that specific subset of markdown, so changes to the prompt's output format must stay in sync with the renderer.
- PWA config (`vite.config.ts`, via `vite-plugin-pwa`) sets up manifest + Workbox runtime caching for `https://api.*` requests — relevant if changing API base URLs or adding new API hosts.
