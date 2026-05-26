# Phase 8 Batch B sub-3 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close polish gaps in the LiveKit Egress recording feed shipped in `1053729` — env scaffolding, dedicated CREDENTIALS section, nav links from `/app/meetings` + `/app/history`, soft-delete UI with shadcn AlertDialog, and component tests.

**Architecture:** 5 sequential atomic commits on a single branch `feat/recordings-polish`, squash-merged to `main`. Each commit is one focused concern. The only new client interactivity is the soft-delete button — page itself stays as a server component. The shadcn AlertDialog primitive becomes a shared `packages/ui` component reusable by future destructive UIs.

**Tech Stack:** Next.js 15 App Router · tRPC v11 · React 18 · shadcn/ui · Radix UI (via shadcn AlertDialog) · vitest + React Testing Library · Tailwind CSS · pnpm workspaces · TypeScript strict

**Parent design spec:** `docs/superpowers/specs/2026-05-26-livekit-egress-polish-design.md` (committed at `45e71a3`)

---

## Pre-flight requirements

Before starting Task 1:

- [ ] **Verify working tree state**

```bash
git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli status --short
```

Expected: only `.claude/scan-results.json` is dirty (it will be committed into Task 1 alongside the env scaffold to clean the tree). Everything else clean. If anything unexpected appears, STOP and report to architect.

- [ ] **Verify on main, sync with origin**

```bash
git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli rev-parse --abbrev-ref HEAD
# Expected: main
git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli fetch origin
git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli log origin/main..HEAD --oneline
# Expected: empty (HEAD = origin/main) OR contains 45e71a3 only (design spec commit ahead of remote)
```

- [ ] **Create the feature branch** (Rule 23)

```bash
git -C /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli checkout -b feat/recordings-polish
```

Expected: switched to new branch.

- [ ] **Confirm test suite is green before starting**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm test --run 2>&1 | tail -20
```

Expected: 465+ passing, 0 failing. If any fail, STOP and report — pre-existing failures must be triaged before polish work continues.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `.env.example` | modify (append block) | Add LiveKit + Coturn placeholder env vars matching `.env.dev` shape |
| `CREDENTIALS.md` | modify (insert section, remove old comment) | Promote LiveKit from one-line comment to dedicated `🎥 LiveKit` section between Xendit and Coturn |
| `apps/web/src/app/app/meetings/page.tsx` | modify (header `<div>` only) | Add `View recordings →` secondary link next to existing "New Meeting" button |
| `apps/web/src/app/app/history/page.tsx` | modify (header `<div>` only) | Add `View recordings →` link on the right of the header |
| `packages/ui/src/components/alert-dialog.tsx` | create (via shadcn CLI) | shadcn AlertDialog primitive — first destructive-action confirmation primitive in the codebase |
| `packages/ui/src/index.ts` | modify (add 1 export line) | Re-export AlertDialog so `import { AlertDialog, ... } from "@yelli/ui"` works |
| `apps/web/src/components/recordings/recording-delete-button.tsx` | create | Client component: trash icon → AlertDialog → `recordings.softDelete` mutation → invalidate list |
| `apps/web/src/components/recordings/recording-delete-button.test.tsx` | create | vitest component tests (5+ cases) covering open/cancel/confirm/loading/error/disabled |
| `apps/web/src/app/app/recordings/page.tsx` | modify (insert button into actions column) | Render `<RecordingDeleteButton recordingId={r.id} />` next to existing download button |
| `.cline/STATE.md` | rewrite (post-merge) | Mark polish closed, set NEXT pointer to overlay cluster |
| `docs/CHANGELOG_AI.md` | append | Polish entry with Agent: CLAUDE_CODE, 5 commits listed |
| `docs/IMPLEMENTATION_MAP.md` | update | Reflect 4 new files |

**Total:** 9 distinct files touched + 1 shadcn MCP install + 3 governance updates after squash-merge.

---

## Task 1: Env scaffold + dirty scan-results commit

**Files:**
- Modify: `.env.example` (append at end)
- Stage: `.claude/scan-results.json` (already dirty from earlier `/scan-project`)

- [ ] **Step 1.1: Verify no existing LiveKit/Coturn entries in `.env.example`**

```bash
grep -i 'LIVEKIT\|COTURN' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/.env.example
```

Expected: empty output (no entries). If anything matches, STOP and report — needs architect resolution (partial-write conflict).

- [ ] **Step 1.2: Append LiveKit + Coturn block to `.env.example`**

Append exactly this block to the end of `.env.example`:

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

Use `Edit` tool with `old_string` = the last existing line of `.env.example` (read first to confirm) and `new_string` = that same line + `\n` + the block above. Do NOT use `Bash` with `echo >>` (forbidden per CLAUDE.md tool rules).

- [ ] **Step 1.3: Verify the block landed correctly**

```bash
tail -20 /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/.env.example
```

Expected: shows the full LIVEKIT + COTURN block at the end with no missing lines.

- [ ] **Step 1.4: Run env validation**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && pnpm tools:check-env
```

Expected: passes (the placeholder values are just template format — `check-env` validates required keys exist in `.env.dev`, not in `.env.example`). If it fails complaining about `.env.example`, STOP and report.

- [ ] **Step 1.5: Commit**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git add .env.example .claude/scan-results.json && git commit -m "$(cat <<'EOF'
chore(env): add LiveKit + Coturn placeholders to .env.example

Promotes LiveKit + Coturn from per-env-only (.env.dev/.env.staging/
.env.prod) to .env.example so the template matches the actual
required env surface. Self-hosted SFU + TURN/STUN are core Yelli
deps — they belong in the template anyone cloning the repo sees.

Also commits the .claude/scan-results.json date bump from the
2026-05-26 /scan-project re-verification run (chore window).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit created, working tree clean.

---

## Task 2: CREDENTIALS.md LiveKit section

**Files:**
- Modify: `CREDENTIALS.md` (insert section + remove one-line comment)

- [ ] **Step 2.1: Locate the old one-line LiveKit comment**

```bash
grep -n 'project-specific.*LiveKit\|LiveKit.*Yelli' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/CREDENTIALS.md
```

Expected: 1-2 lines reference LiveKit as a comment under the "Third-Party API Keys" section. Note line numbers.

- [ ] **Step 2.2: Locate the existing Coturn section as the insertion anchor**

```bash
grep -n '🔁 Coturn\|🎬 Xendit\|🛡️ Cloudflare' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/CREDENTIALS.md
```

Expected: shows the Xendit + Turnstile + Coturn section headers with line numbers. The new LiveKit section goes immediately BEFORE the `## 🔁 Coturn` header to group the two media-server credentials together.

- [ ] **Step 2.3: Read the file region around Coturn to understand exact formatting**

Use `Read` on `CREDENTIALS.md` with `offset` set ~20 lines above the Coturn line from Step 2.2 and `limit: 60`. Confirm:
- The Coturn section uses `## 🔁 Coturn (WebRTC TURN/STUN Server) ✅ FILLED` as its header
- It has a markdown table with `| Environment | Realm | Static Auth Secret | Port |`
- Whatever section appears immediately before Coturn ends with a horizontal `---` or just a blank line

- [ ] **Step 2.4: Insert the LiveKit section before the Coturn header**

Use `Edit` tool. Set `old_string` to the entire `## 🔁 Coturn` header line + a few lines of preceding context (e.g. `\n---\n\n## 🔁 Coturn (WebRTC TURN/STUN Server) ✅ FILLED`). Set `new_string` to that same anchor PRECEDED BY the new LiveKit section:

```markdown
---

## 🎥 LiveKit (Self-Hosted SFU) ✅ FILLED

| Environment | URL                                          | API Key             | API Secret           | Signal Port |
|-------------|----------------------------------------------|---------------------|----------------------|-------------|
| dev         | ws://localhost:${LIVEKIT_SIGNAL_PORT}        | (in .env.dev)       | (48-char in .env.dev)| 43532       |
| staging     | wss://livekit-staging.yelli.powerbyte.app    | (in .env.staging)   | (in .env.staging)    | 443         |
| prod        | wss://livekit.yelli.powerbyte.app            | (in .env.prod)      | (in .env.prod)       | 443         |

Webhook URL (Egress completion events): `${app_url}/api/webhooks/livekit`
Webhook verification: `WebhookReceiver` uses LIVEKIT_API_KEY + LIVEKIT_API_SECRET for HMAC.
Self-hosted via `deploy/compose/{env}/docker-compose.media.yml` — never use cloud.livekit.io.

API key generation (dev):
  docker run --rm livekit/livekit-server generate-keys
  → emits API key + secret pair, paste into .env.dev

---

```

(The final `---\n` becomes the separator before the existing Coturn section.)

- [ ] **Step 2.5: Remove the now-stale one-line LiveKit comment**

Use `Edit` tool on the line(s) found in Step 2.1. If the comment was a single line like `# - 🔑 Third-Party API Keys                [project-specific — LiveKit for Yelli]`, replace it with `# - 🔑 Third-Party API Keys                [project-specific]` (remove just the `— LiveKit for Yelli` trailing portion since LiveKit now has its own dedicated section).

If the grep returned no matches in Step 2.1, skip this step — no stale comment to remove.

- [ ] **Step 2.6: Verify section ordering and no duplication**

```bash
grep -n '^## ' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/CREDENTIALS.md
```

Expected: section headers appear in order, with `## 🎥 LiveKit (Self-Hosted SFU)` between Turnstile and Coturn (or wherever §6.2 of the spec indicated). No duplicate LiveKit headers.

- [ ] **Step 2.7: Commit**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git add CREDENTIALS.md && git commit -m "$(cat <<'EOF'
docs(credentials): promote LiveKit from comment to dedicated section

LiveKit is a Yelli core dependency (self-hosted SFU for video calls).
Previously it appeared only as a one-line comment under "Third-Party
API Keys" — now it gets its own ## 🎥 LiveKit section matching the
format used by Xendit / Turnstile / Coturn, with per-environment
URL + key + signal port table and webhook verification notes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit created, working tree clean.

---

## Task 3: Nav links from /app/meetings + /app/history

**Files:**
- Modify: `apps/web/src/app/app/meetings/page.tsx` (header `<div>` only)
- Modify: `apps/web/src/app/app/history/page.tsx` (header `<div>` only)

- [ ] **Step 3.1: Read the meetings page header**

Use `Read` on `apps/web/src/app/app/meetings/page.tsx`, `limit: 60`. Note the exact existing header block — it's around lines 38-46 and looks like:

```tsx
return (
  <main className="container mx-auto px-4 py-8">
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
      <Button asChild>
        <Link href="/app/meetings/new">New Meeting</Link>
      </Button>
    </div>
```

- [ ] **Step 3.2: Modify meetings page header to add `View recordings →` link**

Use `Edit` tool. Replace the existing `<Button asChild>...</Button>` block with a flex container holding both the new link and the existing button:

```tsx
<div className="flex items-center gap-4">
  <Link
    href="/app/recordings"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    View recordings →
  </Link>
  <Button asChild>
    <Link href="/app/meetings/new">New Meeting</Link>
  </Button>
</div>
```

`Link` is already imported in this file — no new import needed. Verify by checking the existing `import Link from "next/link"` at the top.

- [ ] **Step 3.3: Read the history page header**

Use `Read` on `apps/web/src/app/app/history/page.tsx`, `limit: 80`. The existing header block (around lines 55-68) looks like:

```tsx
return (
  <main className="container mx-auto px-4 py-8">
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Call History</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Recent intercom calls and meetings across your organization.
      </p>
    </div>
```

- [ ] **Step 3.4: Modify history page header to add `View recordings →` link**

Use `Edit` tool. Replace the existing `<div className="mb-6">...</div>` with a flex layout:

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

`Link` is already imported (`import Link from "next/link"` near top). Confirm before editing.

- [ ] **Step 3.5: Run typecheck**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm typecheck
```

Expected: 0 errors. If new errors, STOP and report.

- [ ] **Step 3.6: Run lint**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm lint
```

Expected: 0 NEW errors. Pre-existing warnings (8 of them, in other files) are acceptable per STATE.md.

- [ ] **Step 3.7: Manual dev-server smoke check**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && pnpm dev &
sleep 12
curl -s http://localhost:43541/app/meetings | grep -c "View recordings"
curl -s http://localhost:43541/app/history | grep -c "View recordings"
# kill the dev server
kill %1 2>/dev/null
```

Expected: both `curl | grep -c` returns `1` (the link text appears once on each page). If `0`, STOP — link didn't render server-side. Note: actual APP_PORT may differ; read `.env.dev` first to get `APP_PORT` value, substitute into the curl URL.

If the dev server is already running in another terminal, skip the `pnpm dev &` and `kill` and just `curl` the running instance.

- [ ] **Step 3.8: Commit**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git add apps/web/src/app/app/meetings/page.tsx apps/web/src/app/app/history/page.tsx && git commit -m "$(cat <<'EOF'
feat(recordings): add 'View recordings →' link from meetings + history

Hosts need a way to reach /app/recordings — the page is fully
built but unreachable from the app shell (no global sidebar
exists). Adds a small secondary link on the two natural entry
points: /app/meetings (where you'd schedule the recorded session)
and /app/history (where you'd review past calls).

Refs: Phase 8 Batch B sub-3 polish design spec §5.4 + §5.5

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit created, working tree clean.

---

## Task 4: Soft-delete UI with shadcn AlertDialog (TDD)

**Files:**
- Create (via shadcn MCP): `packages/ui/src/components/alert-dialog.tsx`
- Modify: `packages/ui/src/index.ts` (add 1 export)
- Create: `apps/web/src/components/recordings/recording-delete-button.test.tsx`
- Create: `apps/web/src/components/recordings/recording-delete-button.tsx`
- Modify: `apps/web/src/app/app/recordings/page.tsx`

### Task 4 ordering rationale (TDD per Rule 25)

Within this task, the steps follow strict TDD ordering:
1. Install shadcn primitive (infrastructure — not testable in isolation, just an import target)
2. Write the failing test FIRST (RED)
3. Run it to confirm RED
4. Implement the component to GREEN
5. Re-run to confirm GREEN
6. Wire into the page
7. Commit

If at any point the RED check actually passes (Step 4.3), STOP — the assertion is wrong or the component already exists. Re-read the test.

- [ ] **Step 4.1: Install shadcn AlertDialog primitive into `packages/ui`**

The `shadcn` MCP server is wired in `.mcp.json`. Use the MCP tool to add the AlertDialog component scoped to `packages/ui/`:

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/packages/ui && npx shadcn@latest add alert-dialog --yes
```

Expected: creates `packages/ui/src/components/alert-dialog.tsx` (or wherever `components.json` in `packages/ui` points to).

If the install lands in a wrong location (e.g. `apps/web/src/components/ui/`), STOP — report DONE_WITH_CONCERNS and architect will move it. Framework Rule 26 requires shared shadcn primitives in `packages/ui`.

- [ ] **Step 4.2: Verify the AlertDialog file landed in `packages/ui` and exports the right symbols**

```bash
ls /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/packages/ui/src/components/alert-dialog.tsx 2>&1
grep -E 'export (const|function) (AlertDialog|AlertDialogTrigger|AlertDialogContent|AlertDialogTitle|AlertDialogDescription|AlertDialogCancel|AlertDialogAction)' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/packages/ui/src/components/alert-dialog.tsx
```

Expected: file exists, and grep matches at least: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogCancel`, `AlertDialogAction`.

- [ ] **Step 4.3: Re-export AlertDialog from `packages/ui` barrel**

Read `packages/ui/src/index.ts` first (likely 5-30 lines of existing exports). Add `export * from "./components/alert-dialog";` in alphabetical order with the other existing re-exports.

After editing, verify:

```bash
grep 'alert-dialog' /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/packages/ui/src/index.ts
```

Expected: exactly 1 match (the new export line).

- [ ] **Step 4.4: Locate the existing test mock pattern**

Read `apps/web/src/server/trpc/routers/recordings.test.ts` (first 80 lines) to learn the existing tRPC mock pattern. We will adapt it for the client-side component test.

Also read one existing client component test (if any) for the React Testing Library pattern:

```bash
find /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web/src/components -name '*.test.tsx' 2>/dev/null | head -3
```

If any exist, use `Read` on one to learn the project's RTL setup. If none, fall back to inline `vi.mock("@/lib/trpc/react")` pattern documented in the spec §10.1.

- [ ] **Step 4.5: Write the failing test (RED)**

Create `apps/web/src/components/recordings/recording-delete-button.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RecordingDeleteButton } from "./recording-delete-button";

// Mock tRPC react client. The hook returns a `useMutation` callable that
// itself returns a mutation-shaped object whose `mutate` we can inspect.
const mockMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    recordings: {
      softDelete: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (e: { message: string }) => void }) => ({
          mutate: (vars: { id: string }) => {
            mockMutate(vars);
            // The test triggers onSuccess/onError via the exposed helpers below.
          },
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      recordings: { list: { invalidate: mockInvalidate } },
    }),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe("RecordingDeleteButton", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidate.mockClear();
    mockRefresh.mockClear();
  });

  it("renders trash icon button with accessible label", () => {
    render(<RecordingDeleteButton recordingId="rec-abc123" />);
    const btn = screen.getByRole("button", { name: /delete recording/i });
    expect(btn).toBeInTheDocument();
  });

  it("opens AlertDialog with the correct title and body when trigger is clicked", async () => {
    render(<RecordingDeleteButton recordingId="rec-abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /delete recording/i }));
    await waitFor(() => {
      expect(screen.getByText(/delete this recording\?/i)).toBeInTheDocument();
      expect(screen.getByText(/soft-deleted and excluded from list views/i)).toBeInTheDocument();
    });
  });

  it("Cancel button closes the dialog without firing mutation", async () => {
    render(<RecordingDeleteButton recordingId="rec-abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /delete recording/i }));
    await waitFor(() => screen.getByText(/delete this recording\?/i));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("Delete action button calls mutation.mutate with the recordingId", async () => {
    render(<RecordingDeleteButton recordingId="rec-abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /delete recording/i }));
    await waitFor(() => screen.getByText(/delete this recording\?/i));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(mockMutate).toHaveBeenCalledWith({ id: "rec-abc123" });
  });

  it("renders nothing interactive when disabled prop is true", () => {
    render(<RecordingDeleteButton recordingId="rec-abc123" disabled />);
    const btn = screen.getByRole("button", { name: /delete recording/i });
    expect(btn).toBeDisabled();
  });
});
```

- [ ] **Step 4.6: Run the test to confirm RED**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm vitest run src/components/recordings/recording-delete-button.test.tsx 2>&1 | tail -20
```

Expected: FAIL — error message will be `Failed to resolve import "./recording-delete-button"` (the component doesn't exist yet). This is the correct RED state.

If the test PASSES, STOP — either the component already exists somewhere unexpected, or the test mock is hollow. Re-investigate.

- [ ] **Step 4.7: Implement RecordingDeleteButton (GREEN)**

Create `apps/web/src/components/recordings/recording-delete-button.tsx`:

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@yelli/ui";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { trpc } from "@/lib/trpc/react";

interface RecordingDeleteButtonProps {
  recordingId: string;
  disabled?: boolean;
}

/**
 * Soft-delete a recording. Opens a shadcn AlertDialog confirmation,
 * fires recordings.softDelete on confirm, then invalidates the
 * recordings.list query and refreshes the route to drop the row.
 * Errors render inline under the trigger button (dialog stays open
 * for retry). Mirrors the in-flight pattern from
 * RecordingDownloadButton (Loader2 icon swap).
 */
export function RecordingDeleteButton({
  recordingId,
  disabled = false,
}: RecordingDeleteButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const router = useRouter();

  const mutation = trpc.recordings.softDelete.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.recordings.list.invalidate();
      router.refresh();
    },
    onError: (e: { message: string }) => {
      setError(e.message);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || mutation.isPending}
            aria-label="Delete recording"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is soft-deleted and excluded from list views. Storage
              cleanup runs on the org retention schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setError(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setError(null);
                mutation.mutate({ id: recordingId });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4.8: Run the test to confirm GREEN**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm vitest run src/components/recordings/recording-delete-button.test.tsx 2>&1 | tail -20
```

Expected: 5 tests passing. If any fail:
- Read the failure carefully — common causes: wrong export name from `@yelli/ui` barrel, mock helper shape mismatch, Radix `AlertDialog` rendering portal not flushing in test (may need `await waitFor`)
- DO NOT relax test assertions to make them pass — fix the implementation or the mock setup

- [ ] **Step 4.9: Wire RecordingDeleteButton into the recordings page**

Read `apps/web/src/app/app/recordings/page.tsx` (already in context — 130 lines). Locate the existing actions column block:

```tsx
<div className="mt-2">
  <RecordingDownloadButton
    recordingId={r.id}
    disabled={r.status !== "ready"}
  />
</div>
```

(Around lines 113-118.)

Replace with:

```tsx
<div className="mt-2 flex flex-col items-end gap-1">
  <RecordingDownloadButton
    recordingId={r.id}
    disabled={r.status !== "ready"}
  />
  <RecordingDeleteButton
    recordingId={r.id}
    disabled={r.status === "deleted"}
  />
</div>
```

Add the import near the existing `RecordingDownloadButton` import:

```tsx
import { RecordingDeleteButton } from "@/components/recordings/recording-delete-button";
import { RecordingDownloadButton } from "@/components/recordings/recording-download-button";
```

- [ ] **Step 4.10: Run typecheck**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4.11: Run full test suite**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm test --run 2>&1 | tail -10
```

Expected: 470+ tests passing (was 465; +5 new tests from this task). 0 failures.

- [ ] **Step 4.12: Run lint**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm lint
```

Expected: 0 NEW errors. Pre-existing 8 warnings in other files acceptable.

- [ ] **Step 4.13: Manual dev-server smoke check (optional but recommended)**

If a recording exists in dev DB:
1. Start dev server (`pnpm dev` from project root)
2. Navigate to `http://localhost:${APP_PORT}/app/recordings`
3. Confirm trash icon renders next to download button
4. Click trash → dialog opens with correct title/body
5. Click Cancel → dialog closes
6. Click trash again → click Delete → dialog closes, row disappears

If no recordings exist in dev DB, skip this step — automated tests cover the behavior.

- [ ] **Step 4.14: Commit (TDD bundle)**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git add \
  packages/ui/src/components/alert-dialog.tsx \
  packages/ui/src/index.ts \
  apps/web/src/components/recordings/recording-delete-button.tsx \
  apps/web/src/components/recordings/recording-delete-button.test.tsx \
  apps/web/src/app/app/recordings/page.tsx \
  && git commit -m "$(cat <<'EOF'
feat(recordings): soft-delete UI with shadcn AlertDialog + tests

Wires the existing recordings.softDelete tRPC mutation to a UI
surface. Trash icon button on each recording row opens a shadcn
AlertDialog confirmation; confirm fires softDelete, invalidates
the list, and refreshes the route so the row disappears.

Adds the shadcn AlertDialog primitive to packages/ui as the
first destructive-action confirmation pattern in the codebase
(future delete UIs reuse it from @yelli/ui).

5 new component tests in vitest + RTL covering trigger render,
dialog open, Cancel no-op, Delete mutation call with id payload,
and disabled state.

Test-first (TDD per Rule 25): RED test confirmed before impl,
GREEN confirmed after.

Refs: Phase 8 Batch B sub-3 polish design spec §5.1, §5.2, §5.3, §10.1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit created, working tree clean.

---

## Task 5: Squash-merge + governance updates

**Files:**
- Rewrite: `.cline/STATE.md`
- Append: `docs/CHANGELOG_AI.md`
- Modify: `docs/IMPLEMENTATION_MAP.md`

- [ ] **Step 5.1: Run two-stage review (Rule 25) before merge**

Manually verify each row of the acceptance criteria in design spec §12:

Stage 1 (spec compliance):
- [ ] `.env.example` has all 10 listed keys (7 LiveKit + 3 Coturn)
- [ ] `CREDENTIALS.md` has `## 🎥 LiveKit (Self-Hosted SFU)` section + per-env table; old comment removed
- [ ] `/app/meetings` page renders "View recordings →" link
- [ ] `/app/history` page renders "View recordings →" link
- [ ] `/app/recordings` page renders trash icon next to download button
- [ ] Trash → dialog title "Delete this recording?" + body about "soft-deleted and excluded"
- [ ] Cancel closes dialog with no mutation
- [ ] Delete fires `softDelete` with correct id, dialog closes, row gone
- [ ] Inline error appears on mutation error, dialog stays open

Stage 2 (code quality):
- [ ] No `any` types introduced
- [ ] TDD verified: RED → GREEN sequence for delete button
- [ ] Only blast-radius files touched (9 files exactly — confirm with `git diff --stat main..HEAD`)
- [ ] Conventional commit messages
- [ ] No repeated logic — Loader2 spinner pattern mirrored from `RecordingDownloadButton`, not duplicated

If any item fails, STOP and report to architect — fix before merge.

- [ ] **Step 5.2: Confirm git diff shape**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git diff --stat main..HEAD
```

Expected: ~9 files changed, ~150-250 insertions, ~10-30 deletions. If the diff is dramatically larger, STOP — scope creep happened.

- [ ] **Step 5.3: Squash-merge `feat/recordings-polish` into `main`**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git checkout main && git merge --squash feat/recordings-polish && git commit -m "$(cat <<'EOF'
feat(recordings): Phase 8 Batch B sub-3 polish

Closes the recording feed sub-session 3 polish gaps:

  - Add LiveKit + Coturn placeholders to .env.example
  - Promote LiveKit from one-line comment to dedicated CREDENTIALS section
  - 'View recordings →' nav link from /app/meetings + /app/history
  - Soft-delete UI with shadcn AlertDialog (first destructive
    confirmation primitive in the codebase — reusable via @yelli/ui)
  - 5 new vitest component tests for RecordingDeleteButton (TDD)

Filter UI (E) and Playwright install (G) explicitly deferred.

Files: 9 changed | Test suite: 465 → 470+ passing | typecheck 0 |
lint 0 new errors

Spec: docs/superpowers/specs/2026-05-26-livekit-egress-polish-design.md
Plan: docs/superpowers/plans/2026-05-26-recordings-polish.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 squash commit on `main`. Run `git log --oneline -3` to confirm.

- [ ] **Step 5.4: Delete the feature branch**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git branch -d feat/recordings-polish
```

Expected: branch deleted.

- [ ] **Step 5.5: Append CHANGELOG_AI entry**

Read `docs/CHANGELOG_AI.md` first to see the existing entry format. Append a new entry at the top using the standard format:

```markdown
## 2026-05-26 — Phase 8 Batch B sub-3 polish

- Agent:              CLAUDE_CODE (Opus 4.7 architect + Sonnet 4.6 executors via memory-governance.md §4)
- Why:                Close polish gaps in LiveKit Egress recording feed shipped in 1053729 — env scaffold, dedicated CREDENTIALS section, nav links, soft-delete UI, component tests
- Files added:        packages/ui/src/components/alert-dialog.tsx (shadcn primitive — first destructive-action confirmation in codebase), apps/web/src/components/recordings/recording-delete-button.tsx, apps/web/src/components/recordings/recording-delete-button.test.tsx
- Files modified:     .env.example (LiveKit + Coturn placeholder block), CREDENTIALS.md (dedicated 🎥 LiveKit section), packages/ui/src/index.ts (+1 barrel export), apps/web/src/app/app/meetings/page.tsx (header link), apps/web/src/app/app/history/page.tsx (header link), apps/web/src/app/app/recordings/page.tsx (delete button wiring), .claude/scan-results.json (chore date bump from 2026-05-26 /scan-project re-verification)
- Files deleted:      none
- Schema/migrations:  none
- Errors encountered: none
- Errors resolved:    none
- Spec ref:           docs/superpowers/specs/2026-05-26-livekit-egress-polish-design.md
- Plan ref:           docs/superpowers/plans/2026-05-26-recordings-polish.md
- Squash commit:      [paste short SHA from Step 5.3]
- Parent sub-3 commit: 1053729
```

- [ ] **Step 5.6: Update IMPLEMENTATION_MAP**

Read `docs/IMPLEMENTATION_MAP.md`, find the recordings-related section (likely under Phase 8 Batch B sub-3). Add an entry noting the 3 new files (alert-dialog primitive, recording-delete-button, recording-delete-button test) and the 6 modified files. Adjust the "Tracked total" count by +3 files (~261 → ~264).

- [ ] **Step 5.7: Rewrite STATE.md**

Read current `.cline/STATE.md` to see the format. Rewrite the PHASE / LAST_DONE / NEXT / PHASE_8_BATCH_B_STATUS sections:

```markdown
PHASE:        Phase 8 Batch B sub-3 polish — ✅ CLOSED 2026-05-26 PM. Squash commit on main, branch deleted, governance docs updated.

LAST_DONE:    2026-05-26 PM GMT+8 — feat(recordings) Phase 8 Batch B sub-3 polish squash-merged to main. 9 files changed, test suite 465 → 470+ passing, typecheck 0 errors, lint 0 new errors.

NEXT — pick one for the next session:
1. **Batch B overlay cluster** — File Sharing + Whiteboard (the proposed continuation per Batch B plan). Tier 2 estimate; will need pre-flight existing-surface scan per [[existing-surface-scan-before-scaffold]]. Requires code-review-graph build first (binary installed but project DB not yet built).
2. **Playwright install + first e2e** — deferred from sub-3 polish (option G). Multi-hour install + config + first spec, then host-only start/stop e2e for the recording flow. Own brainstorm needed.
3. **Recordings filter UI (E)** — also deferred from sub-3 polish. Status + meeting + date-range filters on /app/recordings.

BLOCKERS: none
GIT_BRANCH: main (clean)
PORTS: unchanged
TEST_SUITE: 470+ passing (was 465 + 5 new RecordingDeleteButton tests)
TYPECHECK: 0 errors
LINT: 0 new errors (8 pre-existing warnings remain in other files)

PHASE_8_BATCH_B_STATUS:
  sub-1 (Real-time chat over Socket.IO):           ✅ CLOSED 2026-05-25 PM
  sub-2 (Reports CSV/PDF generation):              ✅ CLOSED 2026-05-26 AM
  sub-3 (LiveKit Egress recording feed):           ✅ CLOSED 2026-05-26 AM (1053729)
  sub-3 polish (this work):                        ✅ CLOSED 2026-05-26 PM
  overlay cluster (File Sharing + Whiteboard):     ⬜ NEXT (or Playwright install / filter UI — user pick)
```

- [ ] **Step 5.8: Commit governance updates**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git add docs/CHANGELOG_AI.md docs/IMPLEMENTATION_MAP.md .cline/STATE.md && git commit -m "$(cat <<'EOF'
chore(governance): Phase 8 Batch B sub-3 polish — CHANGELOG + map + STATE

Records the sub-3 polish squash-merge in the three governance docs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit created, working tree clean.

- [ ] **Step 5.9: Final verification — re-run full test suite + governance self-check**

```bash
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli/apps/web && pnpm test --run 2>&1 | tail -10
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && pnpm typecheck 2>&1 | tail -5
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git log --oneline -5
cd /home/me/UbuntuDevFiles/1_COMPANY_DEV/Yelli && git status --short
```

Expected:
- Test suite: 470+ passing, 0 failures
- typecheck: 0 errors
- git log: top entry is `chore(governance)`, second is `feat(recordings) Phase 8 Batch B sub-3 polish` squash, then earlier commits
- git status: clean working tree

- [ ] **Step 5.10: Optional — push to origin**

Per CLAUDE.md "do not push without explicit user instruction" rule: do NOT push automatically. Output to architect: "Ready to push? Run `git push origin main` to publish."

---

## Self-Review (writing-plans skill checklist)

### 1. Spec coverage

| Spec section | Plan task(s) | Covered? |
|---|---|---|
| §1 Purpose | All tasks | ✅ |
| §2 Scope A — .env.example | Task 1 | ✅ |
| §2 Scope B — CREDENTIALS LiveKit | Task 2 | ✅ |
| §2 Scope C — nav links | Task 3 | ✅ |
| §2 Scope D — delete UI | Task 4 (Steps 4.1–4.13) | ✅ |
| §2 Scope F — tests | Task 4 (Steps 4.4–4.6, 4.8) | ✅ |
| §3 Out-of-scope | Not implemented (correct) | ✅ |
| §4 User flow | Task 3 + Task 4 wiring | ✅ |
| §5.1 AlertDialog primitive | Task 4 Steps 4.1–4.3 | ✅ |
| §5.2 RecordingDeleteButton | Task 4 Step 4.7 | ✅ |
| §5.3 Page wiring | Task 4 Step 4.9 | ✅ |
| §5.4 Meetings page link | Task 3 Steps 3.1–3.2 | ✅ |
| §5.5 History page link | Task 3 Steps 3.3–3.4 | ✅ |
| §6.1 .env.example block | Task 1 Step 1.2 | ✅ |
| §6.2 CREDENTIALS section | Task 2 Steps 2.1–2.5 | ✅ |
| §7 Error/loading/empty states | Task 4 Step 4.7 (impl covers all) | ✅ |
| §8 Security & governance | Task 5 Steps 5.5–5.7 | ✅ |
| §9 Commit sequence | Tasks 1, 2, 3, 4, 5 in order | ✅ |
| §10 Testing strategy | Task 4 Steps 4.4–4.6, 4.8 + Task 5 Step 5.9 | ✅ |
| §11 Risks | Task 4 Step 4.1 (shadcn install location), Step 4.4 (mock fallback) | ✅ |
| §12 Acceptance criteria | Task 5 Step 5.1 (Stage 1 + Stage 2 review) | ✅ |
| §13 Definition of done | Task 5 (all steps) | ✅ |

No gaps.

### 2. Placeholder scan

Searched for "TBD", "TODO", "implement later", "add appropriate error handling", "similar to Task N" — no hits in the plan body.

Step 4.7 implementation block contains a complete component, not a stub. Step 4.5 test block contains 5 full test cases, not "write tests for the above". Each Edit step shows the exact `old_string` and `new_string` (or the file region to modify).

One controlled use of templating: in Task 5 Step 5.5 the entry says `[paste short SHA from Step 5.3]` — this is unavoidable since the SHA only exists after the squash-merge. Acceptable inline instruction.

### 3. Type consistency

- `RecordingDeleteButton` props type used identically in Step 4.5 test, Step 4.7 impl, Step 4.9 wiring: `{ recordingId: string; disabled?: boolean }` ✅
- `mutation.mutate({ id: recordingId })` payload shape matches the existing `recordings.softDelete` input schema (`z.object({ id: z.string().cuid() }).strict()`) ✅
- `Loader2 className="size-4 animate-spin"` mirrors exact pattern from `RecordingDownloadButton.tsx` ✅
- `Trash2 className="size-4"` icon size matches `Download className="size-4"` in download button ✅
- `aria-label="Delete recording"` consistent across test selector (Step 4.5) and impl (Step 4.7) ✅

No type drift or naming inconsistencies.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-26-recordings-polish.md`.
