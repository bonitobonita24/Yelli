# Phase 8 Batch B sub-3 Polish — Design Spec

**Date:** 2026-05-26
**Author:** Opus 4.7 (architect) via superpowers:brainstorming
**Status:** Pending user review → writing-plans
**Parent work:** Phase 8 Batch B sub-3 (LiveKit Egress recording) — closed in `1053729`
**Scope tier:** Tier 2 (5-12 files, 2-3 modules, est. ~30K execution tokens total across 5 subagent dispatches)

---

## 1. Purpose

Close polish gaps in the LiveKit Egress recording feed shipped in `1053729`. After re-reading the codebase, the original STATE.md option-2 description ("currently only `getDownloadUrl` exists, no surface to browse") was stale — `/app/recordings/page.tsx` already exists and is fully functional. The real gaps are governance scaffolding (env + CREDENTIALS) and missing UX surfaces (nav linkage + soft-delete UI + tests).

## 2. Scope

| ID | Gap | Files | Effort |
|---|---|---|---|
| A | `.env.example` missing `LIVEKIT_*` + `COTURN_*` placeholders | `.env.example` | trivial |
| B | `CREDENTIALS.md` LiveKit mentioned only as one-line comment under "Third-Party API Keys"; needs dedicated section matching Xendit/Turnstile/Coturn format | `CREDENTIALS.md` | small |
| C | No nav link to `/app/recordings` anywhere | `apps/web/src/app/app/meetings/page.tsx`, `apps/web/src/app/app/history/page.tsx` | small |
| D | `recordings.softDelete` mutation exists but no UI surface uses it | `packages/ui/src/components/alert-dialog.tsx` (shadcn install), `packages/ui/src/index.ts` (barrel export +1 line), `apps/web/src/components/recordings/recording-delete-button.tsx` (new), `apps/web/src/app/app/recordings/page.tsx` (modify) | medium |
| F | No tests for `RecordingDeleteButton`; existing router tests cover the mutation server-side | `apps/web/src/components/recordings/recording-delete-button.test.tsx` (new) | small |

**Total file count:** 9 distinct files touched + 1 shadcn MCP install operation. Aligned with §9 commit table.

**Excluded** (logged in STATE.md as separate follow-ups, not this polish pass):
- E. Filter UI (meeting/status) on the list page — defer to its own session
- G. Playwright install + first e2e — large lift, needs its own brainstorm

## 3. Out-of-scope confirmation

- **No PRODUCT.md change required.** Recordings feature is already declared; this is purely polish of an existing surface.
- **No schema change.** `Recording` model + `RecordingStatus` enum unchanged.
- **No tRPC router change.** `recordings.list`, `recordings.getDownloadUrl`, `recordings.softDelete` all already implemented and tested.
- **No layout change.** App layout (`apps/web/src/app/app/layout.tsx`) remains the minimal `SocketProvider` + `PastDueBanner` + `IncomingCallDialog` wrapper. The "new shared TopBar" option was explicitly rejected during brainstorming as out-of-scope for a polish pass.

## 4. User flow (after polish ships)

```
Existing entry points:
  /app/meetings  ──► "View recordings →" link (NEW) ──► /app/recordings
  /app/history   ──► "View recordings →" link (NEW) ──┘

/app/recordings (existing page, enhanced):
  - Lists tenant recordings (existing server-component fetch via createServerCaller)
  - Per row:
      [download button — existing]
      [delete button — NEW]
                │
                ▼
            shadcn AlertDialog (NEW shared primitive)
              "Delete this recording?"
              "The file is soft-deleted and excluded from list views.
               Storage cleanup runs on the org retention schedule."
              [Cancel] [Delete — destructive variant]
                │
                ▼
            trpc.recordings.softDelete.useMutation
              onSuccess: utils.recordings.list.invalidate() → router.refresh()
              onError:   inline <p role="alert"> message
```

## 5. Components

### 5.1 New: `packages/ui/src/components/alert-dialog.tsx`
shadcn primitive installed via the shadcn MCP. Re-exported from `@yelli/ui` barrel (`packages/ui/src/index.ts`). First destructive-action confirmation primitive in the codebase — sets the canonical pattern for future delete UIs.

### 5.2 New: `apps/web/src/components/recordings/recording-delete-button.tsx`
```tsx
"use client";
- Props: { recordingId: string; disabled?: boolean }
- Internal state: dialog open (managed by AlertDialog), error message
- trpc.recordings.softDelete.useMutation:
    onSuccess → utils.recordings.list.invalidate() + router.refresh()
    onError   → setError(e.message)
- UI:
    Trigger: <Button variant="ghost" size="sm" aria-label="Delete recording"><Trash2 className="size-4" /></Button>
    Dialog content:
      <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
      <AlertDialogDescription>
        The file is soft-deleted and excluded from list views.
        Storage cleanup runs on the org retention schedule.
      </AlertDialogDescription>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => mutation.mutate({ id: recordingId })}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
      </AlertDialogAction>
    Inline error below trigger:
      {error ? <p role="alert" className="text-destructive text-xs mt-1">{error}</p> : null}
```

**Mirror notes:**
- The `<Loader2 className="animate-spin" />` icon swap mirrors `RecordingDownloadButton`'s existing in-flight pattern. This is a **mutation in-flight indicator**, not a content-loading skeleton — therefore CLAUDE.md non-negotiable line 104 (V31.3 dual-path Skeleton/phantom-ui rule) does NOT apply here. The rule governs content-not-yet-loaded states; this is an in-flight mutation button state.
- Error display matches `RecordingDownloadButton.tsx` exactly (`role="alert"`, `text-destructive text-xs`).

### 5.3 Modified: `apps/web/src/app/app/recordings/page.tsx`
Add `<RecordingDeleteButton recordingId={r.id} disabled={r.status === "deleted"} />` to the right-aligned actions column, alongside the existing `RecordingDownloadButton`. Both buttons stack vertically inside the existing `<div className="mt-2">`.

Defensive `disabled={r.status === "deleted"}` — list filters `deleted_at: null` so this case shouldn't render in practice, but kept as belt-and-suspenders against future query changes.

### 5.4 Modified: `apps/web/src/app/app/meetings/page.tsx`
In the existing header `<div className="mb-6 flex items-center justify-between">`, the right side currently holds `<Button asChild><Link href="/app/meetings/new">New Meeting</Link></Button>`. Add a secondary link before it:
```tsx
<div className="flex items-center gap-4">
  <Link
    href="/app/recordings"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    View recordings →
  </Link>
  <Button asChild><Link href="/app/meetings/new">New Meeting</Link></Button>
</div>
```

### 5.5 Modified: `apps/web/src/app/app/history/page.tsx`
Header has only `<h1>` currently — convert to flex row with the same `View recordings →` link on the right:
```tsx
<div className="mb-6 flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Call History</h1>
    <p className="text-muted-foreground mt-1 text-sm">
      Recent intercom calls and meetings across your organization.
    </p>
  </div>
  <Link
    href="/app/recordings"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    View recordings →
  </Link>
</div>
```

## 6. Env & credentials scaffold

### 6.1 `.env.example` append
Append at end of `.env.example` (verify section doesn't already exist — `grep` returned no LiveKit hits):
```bash
# LIVEKIT (Yelli core — self-hosted SFU)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
LIVEKIT_WEBHOOK_URL=http://localhost:3000/api/webhooks/livekit
LIVEKIT_SIGNAL_PORT=7880
LIVEKIT_TURN_UDP_START=50000

# COTURN (TURN/STUN for NAT traversal)
COTURN_REALM=your-app.local
COTURN_STATIC_AUTH_SECRET=your-coturn-48-char-secret
COTURN_LISTENING_PORT=3478
```

**Verification step in Sonnet task:** before writing, the subagent must `grep -i 'LIVEKIT\|COTURN' .env.example` and only append if no entries exist. If partial entries exist, the subagent stops and reports the conflict to Opus for resolution.

### 6.2 `CREDENTIALS.md` LiveKit section
Promote LiveKit from a one-line comment under "Third-Party API Keys" to a dedicated section between Xendit and Coturn (matching the Coturn section's format which already exists at the bottom of the file):

```markdown
## 🎥 LiveKit (Self-Hosted SFU) ✅ FILLED

| Environment | URL                                          | API Key             | API Secret          | Signal Port |
|-------------|----------------------------------------------|---------------------|---------------------|-------------|
| dev         | ws://localhost:${LIVEKIT_SIGNAL_PORT}        | (in .env.dev)       | (48-char in .env.dev)| 43532       |
| staging     | wss://livekit-staging.yelli.powerbyte.app    | (in .env.staging)   | (in .env.staging)   | 443         |
| prod        | wss://livekit.yelli.powerbyte.app            | (in .env.prod)      | (in .env.prod)      | 443         |

Webhook URL (Egress completion events): `${app_url}/api/webhooks/livekit`
Webhook verification: `WebhookReceiver` uses LIVEKIT_API_KEY + LIVEKIT_API_SECRET for HMAC.
Self-hosted via `deploy/compose/{env}/docker-compose.media.yml` — never use cloud.livekit.io.

API key generation (dev):
  docker run --rm livekit/livekit-server generate-keys
  → emits API key + secret pair, paste into .env.dev
```

**Verification step in Sonnet task:** the subagent must locate the existing one-line LiveKit comment ("[project-specific — LiveKit for Yelli]") and remove it as part of the same commit to avoid duplication.

## 7. Error / loading / empty states

| State | UI |
|---|---|
| Delete idle | Ghost trash icon button |
| Dialog open | Radix focus trap (shadcn default), Esc closes |
| Delete mutating | Action button `<Loader2 className="animate-spin" />`, both buttons `disabled` |
| Delete success | Dialog closes; list refetches via `utils.recordings.list.invalidate()` + `router.refresh()`; row disappears (no toast — silent) |
| Delete error | Inline `<p role="alert">` below trigger, dialog stays open for retry |
| Recording status === "deleted" | Button disabled (defensive — list query filters these out) |
| Page empty | Existing "No recordings yet." (untouched) |

## 8. Security & governance

- **Authorization:** Server-side only. `recordings.softDelete` already verifies tenant via L6 Prisma guard + storage-key prefix ownership (`verifyKeyOwnership`). UI adds no extra role gate — server is sole authority per OWASP rule.
- **Audit trail:** `AuditLog` row written inside the `softDelete` transaction (already implemented in sub-3). No UI changes needed.
- **Accessibility:** AlertDialog focus trap, Esc handling, aria-label on trash icon button — all provided by Radix primitive. WCAG 2.1 AA compliant out of the box.
- **CSRF:** N/A — tRPC mutation with Auth.js v5 SameSite=lax cookies (existing posture, no change).
- **Information disclosure:** Error messages from `softDelete` are already generic (`"Recording not found."` on tenant mismatch — 404, never 403, per existing OWASP-aligned router code).
- **Governance writes:** Append to `CHANGELOG_AI.md` after the squash-merge with `Agent: CLAUDE_CODE`, list all 5 commits, link parent commit `1053729`. Update `IMPLEMENTATION_MAP.md` with the 4 new files. Rewrite `.cline/STATE.md` post-merge.

## 9. Commit sequence (Approach 1 — atomic commits within one branch)

Branch: `feat/recordings-polish` → squash-merge to `main` → delete branch.

| # | Commit message | Files | Sonnet subagent token estimate | Verification gate |
|---|---|---|---|---|
| 1 | `chore(env): add LiveKit + Coturn placeholders to .env.example` | `.env.example` | ~5K | `pnpm tools:check-env` passes; grep confirms no duplicates |
| 2 | `docs(credentials): promote LiveKit from comment to dedicated section` | `CREDENTIALS.md` | ~6K | manual visual review of section ordering; ensure old comment removed |
| 3 | `feat(recordings): add 'View recordings →' link from meetings + history pages` | `apps/web/src/app/app/meetings/page.tsx`, `apps/web/src/app/app/history/page.tsx` | ~8K | `pnpm typecheck` 0 errors; `pnpm lint` 0 new errors; dev-server smoke (link renders, navigates) |
| 4 | `feat(recordings): add soft-delete button with AlertDialog confirmation` | `packages/ui/src/components/alert-dialog.tsx` (shadcn add), `packages/ui/src/index.ts` (barrel +1 export), `apps/web/src/components/recordings/recording-delete-button.tsx` (new), `apps/web/src/app/app/recordings/page.tsx` (modify) | ~18K | `pnpm typecheck` 0; `pnpm lint` 0; dev-server smoke (open dialog, cancel, confirm) |
| 5 | `test(recordings): vitest component test for RecordingDeleteButton` | `apps/web/src/components/recordings/recording-delete-button.test.tsx` (new) | ~12K | `pnpm test` → 465+ N passing (target: +5–7 new tests) |

**Architect-Execute Model (memory-governance.md §4):** Each row dispatched via `Agent(model: "sonnet", prompt: [scope])`. Opus reviews status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) after each, runs Stage 1 spec compliance + Stage 2 code quality checks per Rule 25, and either green-lights the next dispatch or requests fixes.

## 10. Testing strategy

### 10.1 New: `RecordingDeleteButton` component test (F)
Framework: vitest + React Testing Library (already in `apps/web/package.json` dev deps).

Test cases:
1. Renders trash icon button with `aria-label="Delete recording"`
2. Click trigger opens AlertDialog with title "Delete this recording?"
3. Dialog renders the soft-delete explanation body text
4. Cancel button closes dialog without firing mutation
5. Delete (action) button calls `mutation.mutate({ id: recordingId })` with the exact `recordingId` prop
6. While mutating, action button shows spinner and is `disabled`
7. On success, calls `utils.recordings.list.invalidate()` and `router.refresh()`
8. On error, renders inline `<p role="alert">` with the error message; dialog stays open
9. `disabled` prop hides interactivity (button not clickable)

Mock pattern: import the existing tRPC mock helper from `recordings.test.ts` (router test) — reuse its `trpcMsw` setup rather than building a new harness.

### 10.2 No new tests for `page.tsx`
The page is a thin server component; the underlying `recordings.list` procedure has full router-level test coverage from sub-3. Adding a snapshot test for the page would test rendering of mock data, not behavior — low value, high maintenance cost. **Skipped intentionally**.

### 10.3 No e2e (G deferred)
Playwright is not installed in the project. Adding it from scratch (config, deps, first spec, dev-server orchestration in CI) is a multi-hour mini-project that doesn't belong bundled into a polish pass. Defer to its own brainstorm session.

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| shadcn MCP install of `alert-dialog` fails or generates non-monorepo-aware paths | Low | Subagent for commit #4 must verify the install lands in `packages/ui/src/components/` (not `apps/web/`), since framework rule Rule 26 says shared shadcn primitives live in `packages/ui`. If install lands wrong, subagent moves file + updates imports + reports DONE_WITH_CONCERNS for Opus review. |
| `RecordingDeleteButton` test cannot reuse `recordings.test.ts` mock helper | Low | Subagent for commit #5 falls back to inline `vi.mock("@/lib/trpc/react")` pattern. Acceptable — the goal is component behavior tests, not network-level integration. |
| `View recordings →` link from `/app/history` looks visually unbalanced (link is on right, content is on left with description) | Low | Mirror exact pattern from `/app/meetings` page; if it looks off, switch to `<header>` with semantic markup. Visual QA gate during commit #3 catches this. |
| AlertDialog destructive variant styling drifts from existing destructive button styles | Low | Use existing `bg-destructive text-destructive-foreground hover:bg-destructive/90` Tailwind classes verbatim (used elsewhere in codebase). Subagent must `grep -r "bg-destructive" apps/web/src` to confirm pattern before applying. |
| Removal of old one-line LiveKit comment in `CREDENTIALS.md` breaks something downstream | Very Low | The comment is purely informational ("[project-specific — LiveKit for Yelli]"). No `sync-credentials-to-env.sh` parses it. Safe to delete. |

## 12. Acceptance criteria

A reviewer must be able to verify all of these in under 5 minutes:

- [ ] `.env.example` contains `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_WEBHOOK_URL`, `LIVEKIT_SIGNAL_PORT`, `LIVEKIT_TURN_UDP_START`, `COTURN_REALM`, `COTURN_STATIC_AUTH_SECRET`, `COTURN_LISTENING_PORT` — all with placeholder values, no real secrets
- [ ] `CREDENTIALS.md` has a `## 🎥 LiveKit (Self-Hosted SFU)` section with per-environment URL/key/secret table; old one-line comment is removed
- [ ] `/app/meetings` page renders a "View recordings →" link next to "New Meeting" button
- [ ] `/app/history` page renders a "View recordings →" link in the top-right
- [ ] Both links navigate to `/app/recordings` without errors
- [ ] `/app/recordings` page renders a trash icon button next to each download button
- [ ] Trash icon → opens `AlertDialog` with the exact title and body text from §5.2
- [ ] Cancel closes dialog with no mutation fired
- [ ] Delete fires `softDelete`, dialog closes, row disappears (silent success), no toast
- [ ] If mutation errors, inline error appears under the trash button, dialog stays open for retry
- [ ] `pnpm test` passes with at least 5 new component tests for `RecordingDeleteButton`
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 new errors (warnings allowed if pre-existing)
- [ ] Branch `feat/recordings-polish` squash-merged to `main`, branch deleted, `STATE.md` rewritten to mark polish pass closed

## 13. Definition of done

- All 5 commits land on `main` (squash-merged from `feat/recordings-polish`)
- Test suite: 465+ N passing (zero regressions)
- `CHANGELOG_AI.md` appended with Phase 8 Batch B sub-3 polish entry, Agent: CLAUDE_CODE, 5 commits listed
- `IMPLEMENTATION_MAP.md` updated to reflect 4 new files (alert-dialog.tsx, recording-delete-button.tsx + test, plus the modified pages)
- `STATE.md` rewritten: `PHASE: Phase 8 Batch B sub-3 polish — ✅ CLOSED`, `NEXT: overlay cluster (File Sharing + Whiteboard) OR Playwright install`
- Two new lessons added to `lessons.md` if anything surprising surfaces (e.g. shadcn MCP behavior in monorepo, or test mock pattern)
- Dirty `.claude/scan-results.json` from the earlier `/scan-project` re-verification gets committed in commit #1 or as a separate trailing `chore(scan)` — keeps working tree clean for the next session

## 14. Rejected alternatives

1. **Global TopBar in `app/layout.tsx`** — rejected: changes layout for every existing `/app/*` page (out-of-scope blast radius for a polish pass; needs its own brainstorm).
2. **Per-meeting deep link from `/app/meeting/[id]` only** — rejected: lowest discoverability; hosts who weren't in the meeting cannot find recordings.
3. **Two-click inline confirm for delete** — rejected: no existing pattern in the codebase, unfamiliar UX; AlertDialog is the canonical shadcn answer and establishes the convention for future destructive actions.
4. **Skip delete UI entirely** — rejected: `softDelete` mutation is fully tested but unreachable from UI; leaving it dead is wasteful.
5. **Single bundled commit** — rejected: harder to bisect future regressions; loses the per-concern git history that matches sub-3's own atomic-commit cadence.
6. **Split commit #4 (delete UI) into its own follow-up PR** — rejected: `npx shadcn add alert-dialog` is a 30-second op; splitting adds friction without benefit.
7. **Full scope including filter UI (E) and Playwright (G)** — rejected during scope question: E needs its own design (status filter vs meeting filter vs date range — multiple UX paths), G is a multi-hour install + config + first-spec lift.

## 15. Followups (not this polish pass)

- E. Filter UI on `/app/recordings` (meeting selector + status filter + date range)
- G. Playwright install + first e2e for host-only recording start/stop flow
- Recordings retention sweep cron (background job to hard-delete soft-deleted recordings older than org retention policy)
- Recordings count badge on the "View recordings →" link ("View recordings (12) →")
- Bulk select + bulk delete on `/app/recordings` (probably needs the filter UI from E first)
- Recording sharing — generate time-limited share link for non-tenant viewers (security implications need brainstorm)

---

**End of design spec.** Next step per the brainstorming flow: spec self-review → user review gate → invoke `writing-plans` skill.
