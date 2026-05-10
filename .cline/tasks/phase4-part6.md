# Phase 4 Part 6 — apps/[mobile] (Expo full scaffold) — SKIP IF NO MOBILE
# Fresh session. Read STATE.md first.
TASK: Generate the mobile app Expo scaffold (Part 6 of 8).
SKIP CONDITION: IF inputs.yml has no mobile app declared in apps[] → output:
  "Part 6 skipped — no mobile app declared in inputs.yml.
   Open phase4-part7.md in a NEW Claude Code session."
  Then rewrite STATE.md to mark Part 6 skipped, commit nothing, STOP.

IF mobile declared:
- Read .cline/STATE.md first. Confirm Parts 1-5 complete.
- Read inputs.yml (apps[mobile] section). Read PRODUCT.md (Mobile Needs section only).
- Read DECISIONS_LOG.md (mobile framework, offline-first, push provider).
- Create scaffold/part-6 branch.
- Generate full Expo scaffold per phases.md PART 6:
  - app.json / app.config.ts, eas.json (App Store + Play Store)
  - src/env.ts typed env vars
  - src/components/ui/ React Native Reusables + NativeWind
  - src/app/ Expo Router screens for every mobile workflow
  - src/api/ — uses packages/api-client/ ONLY (NEVER packages/db — Rule 13)
  - src/storage/ WatermelonDB / AsyncStorage / MMKV (per inputs.yml)
  - src/sync/ offline queue + sync (CONDITIONAL — if offline-first)
  - src/notifications/ Expo Push or FCM+APNs (CONDITIONAL — if push enabled)
- All files .ts / .tsx only — Rule 12.
- Use context7 (Rule 30) for: Expo, WatermelonDB, React Native Reusables.
- Run: pnpm typecheck. Fix all errors.
- Rewrite STATE.md. Commit. Squash-merge. Delete branch.
- Output: "✅ Part 6 complete. Open phase4-part7.md in a NEW Claude Code session."
STOP HERE.
