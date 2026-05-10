---
name: skillpilot
description: "Foundational skill orchestration layer — activates FIRST in every session to intelligently assemble the optimal, non-conflicting skill set for the current project. Use this skill at the start of ANY session, before any other skill triggers. Also use when: the user asks 'what skills should I use', task type shifts mid-session, you're about to recommend installing skills, or you detect the current skill set is burning tokens inefficiently. This skill governs ALL skill selection decisions."
---

# Skillpilot — Intelligent Skill Orchestration

You are now operating with Skillpilot, Claude's foundational intelligence layer for skill management. This skill makes you aware of your full capability library and teaches you to activate the right combination — never too many, never conflicting, always token-efficient.

## Philosophy

Every skill loaded costs tokens. Every unnecessary file read costs tokens. Every conflicting directive wastes tokens resolving ambiguity. Skillpilot exists to make you a precision instrument: load exactly what you need, nothing more.

The goal is not "more skills = more power." The goal is **the minimum skill surface that maximizes capability per token spent.**

---

## Session Start Protocol

At the beginning of every session, before doing any work:

1. **Detect project type** — read the project root for signals (see Project Detection below)
2. **Assemble skill profile** — Primary Group + Project-Adaptive picks
3. **Check for conflicts** — never recommend two skills that fight each other
4. **Check Memory Governance** — if Spec-Driven project detected, verify `.claude/rules/memory-governance.md` exists. If missing, flag for install via `/scan-project`.
5. **Report briefly** — one-line summary of what's active and why

Output format:
```
⚡ Skillpilot: [project-type] detected → Primary Group + [N] project skills active
   Primary: [list]
   Project: [list]
   Memory Governance: [ACTIVE | MISSING — run /scan-project to install]
   Conflicts avoided: [any notable exclusions]
```

Keep this under 4 lines. The user doesn't need a wall of text — just enough to know what's guiding you.

---

## Skill Prioritization Criteria

Not all skills are equal. When deciding what belongs in the Primary Group — or what to recommend for any project — rank candidates by these criteria (in order of weight):

### Tier 1: Must-Have Criteria

| Criterion | What It Means | Example |
|-----------|--------------|---------|
| **Token efficiency** | Reduces total tokens needed per task (via fewer reads, fewer retries, fewer wrong turns) | code-review-graph saves 2000-5000 tokens/task by replacing blind exploration with graph queries |
| **Conflict isolation** | Low/zero conflict potential with other skills — plays well with everything | planning-with-files conflicts with nothing; it's pure strategy |
| **Universality** | Useful in 80%+ of projects regardless of stack | owasp-security applies to every project that ships code |

### Tier 2: Strong Criteria

| Criterion | What It Means | Example |
|-----------|--------------|---------|
| **Batteries included** | One skill replaces many — bundled capabilities that would otherwise need 3-5 separate skills | superpowers bundles TDD + debugging + verification + parallel agents + git workflows in one coherent package |
| **Uniqueness** | Does something no other skill does — irreplaceable capability | graphify's multi-modal ingestion (code + PDFs + images) is unique in the library |
| **Discipline enforcement** | Makes Claude do the right thing even when the easy thing is different | TDD forces test-first design, preventing the natural "code first, test later" drift |

### Tier 3: Bonus Criteria

| Criterion | What It Means | Example |
|-----------|--------------|---------|
| **Composability** | Works better alongside other skills — multiplicative, not additive | planning-with-files + brainstorming = plan what emerges from ideation |
| **Graceful degradation** | Adds value even in partial application — no "all or nothing" | owasp-security helps even if you only follow 3 of its 10 rules |
| **Active maintenance** | Skill is regularly updated, not abandoned | superpowers (obra) is actively maintained with new skills added |

### How Codebase Analysis Overrides Criteria

The criteria above are defaults. **Actual project analysis always wins:**

- A Python ML project doesn't need frontend-design regardless of how universally useful it is elsewhere
- A 5-file script doesn't need code-review-graph despite its token-saving potential — the overhead exceeds the benefit
- A security-critical fintech project elevates defense-in-depth from "nice" to "mandatory"

The Primary Group is a starting template. Project reality shapes the final selection.

---

## The Primary Group

These are your baseline skills — universally useful, non-conflicting, and each one either **reduces token consumption** or **prevents wasted work cycles**. Load these regardless of project type.

### Slot 1: Superpowers (Foundational Toolkit)

**Purpose:** A single coherent skill bundle that provides disciplined workflows for the most common engineering tasks — testing, debugging, verification, parallel work, and git hygiene.

| Skill | What It Provides |
|-------|-----------------|
| `superpowers` (obra/superpowers) | TDD workflow, systematic debugging, root-cause tracing, verification-before-completion, brainstorming, parallel agent dispatching, git worktrees, finishing branches, code review requesting/receiving |

**Why Slot 1:** Superpowers is the highest "batteries included" score in the entire library. One installation replaces 8+ individual skills. It enforces discipline (TDD, verification) while providing flexibility (brainstorming, parallel agents). Zero conflict with other Primary Group members because it IS the workflow layer — other skills provide domain knowledge that rides on top of these workflows.

**What this replaces:** With superpowers active, you don't separately need: `test-driven-development`, `systematic-debugging`, `root-cause-tracing`, `brainstorming`, `using-git-worktrees`, `finishing-a-development-branch`, `verification-before-completion`, `dispatching-parallel-agents`. They're all included.

### Slot 2: Codebase Awareness (Token Saver)

**Purpose:** Eliminate blind grep/read exploration cycles. Navigate code via structured knowledge instead of brute-force file reading.

| Skill | When to pick |
|-------|-------------|
| `code-review-graph` | Default choice — SQLite graph, blast radius, risk-scored reviews, 28 MCP tools. Best for established codebases where review quality matters. |
| `socraticode` (MCP-only) | Add alongside CRG when you need vector semantic search across large codebases (10K+ files). Install as MCP server only — no SKILL.md directives. |
| `graphify` | Pick instead of CRG when the project has mixed content (code + docs + PDFs + images). Multi-modal ingestion is unique to Graphify. |

**Rule:** Only ONE of these as the active skill. SocratiCode can supplement as MCP-only. Never activate graphify + code-review-graph together.

**Why this slot matters:** Without codebase awareness, every task starts with 5-15 file reads just to orient. A knowledge graph reduces this to 1-2 targeted queries. On a 500-file project, this saves 2000-5000 tokens per task.

**Skip when:** Project has < 20 files (overhead exceeds benefit).

### Slot 3: Strategic Thinking (Waste Preventer)

**Purpose:** Force think-before-code discipline. A plan prevents the #1 token waste pattern: building the wrong thing, then rebuilding.

| Skill | Role |
|-------|------|
| `planning-with-files` | Creates structured plans in files before implementation. Forces decomposition. Persists across sessions. |

**Note:** Brainstorming is already included in superpowers (Slot 1). Planning-with-files adds the persistence layer — plans written to disk survive session boundaries and serve as contracts between user and Claude.

**Why this slot matters:** Without planning, Claude dives into implementation and discovers halfway through that the approach is wrong. One plan (50-100 tokens to write) prevents 2000-10000 tokens of wasted implementation + redo.

### Slot 4: Frontend Intelligence (Build-Right Pipeline)

**Purpose:** Design + Build + Secure in one pass. No separate "now make it pretty" or "now secure it" phases.

| Skill | When active |
|-------|-------------|
| `frontend-design` | When project has UI (React, Vue, Svelte, HTML, CSS, Tailwind). Guides component architecture, responsive design, accessibility. |
| `design-auditor` | Complementary — validates design decisions against UX heuristics. Catches usability issues before users do. |
| `owasp-security` | Always active. Baseline secure-coding awareness. Prevents XSS, injection, auth bugs during normal coding — not a full audit, just "don't introduce vulnerabilities." |

**Conditional activation:** `frontend-design` and `design-auditor` only load for projects with UI. `owasp-security` loads always — it's the cheapest insurance in the library.

**Why this slot matters:** Security and design debt are the most expensive to fix post-launch. Catching them during initial implementation costs zero extra tokens — you're already writing the code.

### Slot 5: Workflow Intelligence (Context Preserver)

**Purpose:** Git discipline and workflow automation that preserves context across sessions.

| Skill | Role |
|-------|------|
| `git-pushing` | Proper commit messages, branch management, push discipline. Ensures each session's work is self-documenting. |

**Note:** `finishing-a-development-branch`, `using-git-worktrees`, and `verification-before-completion` are already in superpowers (Slot 1). This slot adds `git-pushing` specifically for its commit message discipline and push safety.

**Why this slot matters:** Messy git history means future sessions start with `git log` archaeology. Clean commits are self-documenting — they preserve context for free.

### Slot 6: Multi-Framework Competence (Optional Power Slot)

**Purpose:** When the project spans multiple frameworks or the user works across diverse codebases, having broad implementation knowledge loaded prevents "let me look that up" delays.

| Skill | When to pick |
|-------|-------------|
| `claude-skills-65` | Full-stack projects touching multiple frameworks (React + NestJS + Python + DevOps). 65 progressive-disclosure skills covering 30+ frameworks. |
| Skip this slot | When the project is single-stack and simple enough that Claude's base knowledge suffices. |

**Why this is optional:** For single-framework projects, Claude's base knowledge + the codebase awareness slot is sufficient. This slot shines on polyglot projects or when the user frequently switches between different repos.

---

### Primary Group Summary

| Slot | Default Skill(s) | Conflict Risk | Token Impact |
|------|------------------|---------------|-------------|
| 1. Foundational Toolkit | `superpowers` | NONE — it IS the workflow layer | Saves 3000-8000 tokens/session via discipline |
| 2. Codebase Awareness | `code-review-graph` | HIGH within Code Intelligence group | Saves 2000-5000 tokens/task via graph queries |
| 3. Strategic Thinking | `planning-with-files` | NONE | Saves 2000-10000 tokens via preventing wrong turns |
| 4. Frontend Intelligence | `frontend-design` + `design-auditor` + `owasp-security` | NONE | Prevents entire redo cycles |
| 5. Workflow | `git-pushing` | NONE | Preserves context for free |
| 6. Multi-Framework (optional) | `claude-skills-65` | NONE | Prevents lookup delays |

**Total active skills from Primary Group:** 5-7 (depending on whether frontend and multi-framework slots activate)

**What's NOT in Primary but was considered:**

| Skill | Why Not Primary | When to Elevate |
|-------|----------------|-----------------|
| `defense-in-depth` | Overlaps with owasp-security baseline; adds weight | Security-critical projects (fintech, healthcare) |
| `deep-research` | Not every project needs external research | Research-heavy tasks, market analysis |
| `webapp-testing` | Superpowers already includes TDD; this adds E2E specifics | Projects with complex user flows |
| `mcp-builder` | Niche — only for projects building MCP servers | Claude plugin/MCP development |
| `spartan-ai-toolkit` | Token-efficient patterns are good, but overlaps with skillpilot's own guidance | Large-scale AI applications |

---

## Project Detection

Read these signals from the project root to determine project type:

| Signal | Project Type | Additional Skills to Suggest |
|--------|-------------|------------------------------|
| `package.json` + React/Next/Vue/Svelte | Frontend/Fullstack | `frontend-design`, `design-auditor`, `webapp-testing` |
| `package.json` + Express/Fastify/Hono/NestJS | Backend API | `systematic-debugging`, `defense-in-depth` |
| `pyproject.toml` / `requirements.txt` | Python | `systematic-debugging` |
| `Cargo.toml` | Rust | `systematic-debugging` |
| `docker-compose.yml` / `Dockerfile` | DevOps/Infra | `hashicorp-agent-skills` (if Terraform present) |
| `.github/workflows/` | CI/CD | `using-git-worktrees` |
| `*.test.*` / `*.spec.*` / `__tests__/` | Test-heavy | TDD already in Primary — no additions needed |
| ML/AI libs (torch, tensorflow, sklearn) | ML/Data | `csv-data-summarizer-claude-skill`, `deep-research` |
| `.mcp.json` / MCP configs | MCP project | `mcp-builder` |
| `CLAUDE.md` / `.claude/` | Claude-aware project | Check for skill conflicts with installed skills |
| `docs/SpecDrivenAIMegaPrompt/` or `SPEC-DRIVEN PLATFORM` in CLAUDE.md | Spec-Driven project | **Memory Governance V31.2 required** — verify `.claude/rules/memory-governance.md` exists. If missing, recommend `/scan-project` to auto-install. Opus→Sonnet Architect-Execute Model applies to Phase 4/7/8. V31.2 adds a 30K token budget gate (Step 2.5): every Sonnet subagent task must be estimated ≤30K before dispatch — if over, split further. Genuinely atomic tasks >30K escalate to Agent(model: "opus") as last resort (Step 2.5b). |
| Blockchain deps (ethers, web3, hardhat) | Web3 | `owasp-security` (already primary), relevant chain skills |

### Detection Rules

1. Read `package.json`, `pyproject.toml`, `Cargo.toml`, or equivalent at root
2. Scan top-level directories (max 2 levels deep — don't recurse the whole tree)
3. Check for framework config files (next.config.*, vite.config.*, tailwind.config.*)
4. Check `.claude/settings.local.json` for already-installed skills
5. Output project type classification in under 50 tokens

---

## Conflict Registry

These skills MUST NOT be active simultaneously. When recommending skills, always check this registry.

### Mutual Exclusion Groups

```
CODE_INTELLIGENCE (pick ONE as active skill):
  - graphify
  - socraticode
  - code-review-graph
  Exception: socraticode as MCP-only (.mcp.json) alongside either other
  Exception: graphify as MCP-only alongside code-review-graph
  Reason: All three parse ASTs, build code graphs, and override Claude's
          file-reading strategy. Two competing "query graph first" directives
          = confused agent, double processing, wasted tokens.

DEBUGGING_STRATEGY (pick ONE as primary):
  - systematic-debugging
  - root-cause-tracing
  Note: MEDIUM conflict — both direct code navigation strategy differently.
        If both needed, use systematic-debugging as primary, root-cause-tracing
        only when explicitly tracing deep execution chains.

NAVIGATION_OVERRIDE (implicit — covered by CODE_INTELLIGENCE):
  - Any skill that says "search X before reading files" conflicts with
    any other skill that says "query Y before reading files"
```

### Pairwise Conflicts

| Skill A | Skill B | Severity | Resolution |
|---------|---------|----------|------------|
| graphify | socraticode | HIGH | Pick one. Graphify for multi-modal, SocratiCode for code-only + vector search |
| graphify | code-review-graph | HIGH | Pick one. Graphify for exploration, CRG for review workflow |
| socraticode | code-review-graph | HIGH (as skills), LOW (MCP-only pattern) | CRG as skill + SocratiCode as MCP-only = valid combo |
| code-review-graph | root-cause-tracing | MEDIUM | CRG covers blast radius already; use root-cause only for deep execution tracing |
| socraticode | root-cause-tracing | HIGH | SocratiCode's impact analysis fully overlaps |
| systematic-debugging | root-cause-tracing | MEDIUM | Use systematic as primary, root-cause as escalation |
| planning-with-files | brainstorming | NONE | Complementary — plan = "what", brainstorm = "what could" |
| frontend-design | design-auditor | NONE | Complementary — design creates, auditor validates |
| TDD | systematic-debugging | NONE | Complementary — TDD prevents bugs, debugging fixes them |
| owasp-security | defense-in-depth | LOW | OWASP is subset awareness; defense-in-depth is full hardening. Both OK. |

### Conflict Check Algorithm

Before recommending any skill activation:

```
1. Get candidate skill
2. Check: is candidate in a MUTUAL_EXCLUSION group?
   → If yes: is another member of that group already active?
     → If yes: BLOCK. Suggest replacement or MCP-only pattern.
3. Check: does candidate have PAIRWISE conflicts with any active skill?
   → If HIGH: BLOCK. Explain why and suggest alternative.
   → If MEDIUM: WARN. Allow but note the overlap.
   → If LOW: ALLOW silently.
4. Pass → recommend activation
```

---

## Per-Skill Conflict Analysis

Every time you recommend a skill set (at session start, after /scan-project, or mid-session), produce a **conflict analysis card** for each skill. This is not optional — it's the foundation that prevents future issues.

### Analysis Output Format

After assembling the skill profile, present this analysis (collapsed/brief for clean sessions, expanded when conflicts exist):

```
## Skill Compatibility Report

| Skill | Status | Conflicts With | Remedy |
|-------|--------|---------------|--------|
| superpowers | ✅ CLEAR | — | — |
| code-review-graph | ✅ CLEAR | — | — |
| planning-with-files | ✅ CLEAR | — | — |
| frontend-design | ✅ CLEAR | — | — |
| owasp-security | ✅ CLEAR | — | — |
| git-pushing | ✅ CLEAR | — | — |

No conflicts detected. All skills are compatible.
```

When conflicts exist:

```
## Skill Compatibility Report

| Skill | Status | Conflicts With | Remedy |
|-------|--------|---------------|--------|
| superpowers | ✅ CLEAR | — | — |
| code-review-graph | ⚠️ CONFLICT | graphify (global) | Remedy: Remove graphify from global, or switch to graphify here and remove CRG |
| socraticode | ⚠️ CONFLICT | code-review-graph (project) | Remedy: Install socraticode as MCP-only (`.mcp.json`), not as skill |
| root-cause-tracing | ❌ BLOCKED | superpowers:systematic-debugging | Remedy: Remove — superpowers already covers this via systematic-debugging |

### Remediation Plan
1. `graphify` → REMOVE from `~/.claude/skills/` (globally installed, conflicts with project's CRG)
2. `socraticode` → CONVERT to MCP-only: add to `.mcp.json`, do NOT install as skill
3. `root-cause-tracing` → SKIP entirely (superpowers subsumes it)
```

### Per-Skill Conflict Card (internal reasoning)

For each candidate skill, evaluate these 5 dimensions:

| Dimension | Question | If YES → |
|-----------|----------|----------|
| **Directive Collision** | Does this skill override Claude's file-reading/navigation strategy? | Check against all other active skills that also override navigation |
| **AST/Parse Duplication** | Does this skill parse code via tree-sitter, ast-grep, or similar? | Check against other AST-parsing skills — double parsing wastes compute |
| **Hook Collision** | Does this skill register git hooks (SessionStart, PostToolUse)? | Check if another skill uses the same hook events — can cause race conditions |
| **Domain Overlap** | Does this skill cover the same capability domain as another active skill? | Identify which does it better for THIS project and block the weaker one |
| **Token Load** | Does adding this skill push total context beyond 7-8 active skills? | Suggest MCP-only pattern or defer to mid-session activation |

### Remediation Strategies (ordered by preference)

When a conflict is detected, apply the FIRST viable remedy:

| Priority | Remedy | When to Use | Example |
|----------|--------|-------------|---------|
| 1 | **Remove redundant** | Skill A fully subsumes Skill B's capabilities | superpowers includes systematic-debugging → remove standalone systematic-debugging |
| 2 | **MCP-only conversion** | Skill's tools are useful but directives conflict | socraticode as `.mcp.json` entry alongside code-review-graph |
| 3 | **Project-level disable** | Global skill conflicts with better project-specific choice | Disable global graphify in `.claude/settings.local.json` |
| 4 | **Ignore-file mitigation** | Skills coexist but one indexes the other's output files | Add planning docs to `.graphifyignore` or `.socraticodeignore` |
| 5 | **Scope separation** | One skill is primary for navigation, other is escalation-only | systematic-debugging = primary, root-cause-tracing = only when debugging escalates |
| 6 | **Replace with better fit** | Neither skill is ideal; a third option covers both use cases | Replace both graphify + root-cause-tracing with code-review-graph (has both graph + blast radius) |

### Conflict Inheritance Rules

Some skills bundle other skills internally. When a bundle is active, its internal skills are "claimed" — installing them separately is redundant and can conflict.

| Bundle Skill | Claims (do not install separately) |
|-------------|-----------------------------------|
| `superpowers` | systematic-debugging, root-cause-tracing, test-driven-development, brainstorming, verification-before-completion, using-git-worktrees, finishing-a-development-branch, dispatching-parallel-agents, requesting-code-review, receiving-code-review |
| `code-review-graph` | Includes its own debug-issue, explore-codebase, refactor-safely skills — don't add separate debug/explore/refactor skills that overlap |
| `claude-skills-65` | 65 framework-specific skills — don't add individual framework skills (react-expert, nestjs-expert, etc.) that it already covers |

**Rule:** Before recommending any individual skill, check if an active bundle already claims it. If yes → SKIP with note "already covered by [bundle]."

### When to Re-Run Conflict Analysis

- **Session start** — always (lightweight check against installed skills)
- **After /scan-project** — the scanner already does this, but verify its output
- **Mid-session skill activation** — before activating any new skill
- **After dependency changes** — `npm install`, `pip install`, etc. may introduce new framework-specific skills needs
- **User reports unexpected behavior** — conflicting skills can cause "Claude ignores my instructions" symptoms. Check for directive collisions first.

---

## Mid-Session Skill Suggestions

When you detect a task shift, suggest skill activation. Don't load skills preemptively — suggest them at the moment they become relevant.

| Task Signal | Action |
|-------------|--------|
| User says "debug" / "fix" / "broken" / "error" | Use superpowers' systematic-debugging workflow (already loaded). Escalate to `defense-in-depth` only for security bugs. |
| User says "deploy" / "ship" / "release" | Use superpowers' finishing-a-development-branch + git-pushing (already loaded). |
| User says "test" / "coverage" / "spec" | Use superpowers' TDD workflow (already loaded). Add `webapp-testing` for E2E/Playwright specifics. |
| User says "design" / "UI" / "layout" / "component" | Activate `frontend-design` + `design-auditor` if not already in Primary for this project. |
| User says "research" / "investigate" / "explore" | Activate `deep-research` for external research. Use codebase awareness for internal exploration. |
| User says "review" / "PR" / "code review" | Use `code-review-graph` review workflow (already in Primary). Use superpowers' code-review skills. |
| User says "refactor" / "clean up" / "rename" | Use codebase awareness skill's refactor tools (already loaded). |
| User says "plan" / "architect" / "design system" | Use `planning-with-files` + superpowers' brainstorming (both already loaded). |
| User says "secure" / "vulnerability" / "audit" | `owasp-security` (already primary) → escalate to `defense-in-depth` + `trailofbits-security-skills` for deep audits. |
| User says "automate" / "workflow" / "n8n" | Suggest `n8n-*` skills cluster for automation platforms. |
| User says "API" / "endpoint" / "REST" / "GraphQL" | Confirm superpowers' TDD covers it. Add `defense-in-depth` for API security. |

### How to Suggest

Don't interrupt flow. Weave it naturally:

Good: "I'll use the systematic-debugging workflow for this — let me trace the issue."
Bad: "NOTICE: Activating skill systematic-debugging for this task. Proceeding with debugging protocol step 1..."

The user should feel the benefit, not the machinery.

---

## Token Budget Awareness

Track your token expenditure patterns and prefer approaches that minimize waste:

### High-Cost Patterns (avoid)

| Pattern | Token Cost | Better Alternative |
|---------|-----------|-------------------|
| Reading entire files to find one function | 500-2000 per file | Query knowledge graph → read only target lines |
| Grep + read + grep + read exploration | 1000-5000 per cycle | Single graph query for relationship |
| Re-reading files you already saw this session | 500-1500 per re-read | Use working memory, don't re-read |
| Installing all skills from a preset | High context overhead | Primary Group + 2-3 targeted project skills |
| Loading 10+ skills simultaneously | Competing directives | Max 7-8 active skills total |

### Low-Cost Patterns (prefer)

| Pattern | Why It's Efficient |
|---------|-------------------|
| Plan first, execute once | 100 tokens planning saves 2000 tokens of redo |
| Graph query before file read | 20-token query replaces 500-token file exploration |
| TDD: test first reveals design issues early | 50-token test failure prevents 1000-token bad implementation |
| Batch related changes in one pass | Avoids context-switching overhead between files |
| Use skill's structured workflow | Skills encode efficient patterns — following them is faster than improvising |

### Self-Check

Every 5-10 tool calls, briefly assess:
- Am I reading files I've already seen? → Use memory instead
- Am I exploring without a target? → Query the graph
- Am I implementing without a plan? → Stop, plan, then continue
- Am I loading skills I'm not using? → Recommend deactivation

---

## Skill Capacity Limits

**Maximum active skills:** 7-8 total (Primary Group + 2-3 project-specific)

Beyond 8 active skills, you get diminishing returns and increasing conflict risk. If the user wants more capabilities, suggest the MCP-only pattern for supplementary tools rather than activating more skill directives.

**Priority order when cutting:**
1. Keep: Superpowers (most value per byte — replaces 8 individual skills)
2. Keep: Codebase awareness (biggest token saver)
3. Keep: Planning (biggest waste preventer)
4. Keep: Security baseline (cheapest insurance)
5. Negotiate: Frontend skills (only if project has UI)
6. Negotiate: Multi-framework (only if polyglot project)
7. Cut first: Any skill that hasn't been triggered in 10+ interactions

---

## Recommended Skill Profiles

Pre-assembled profiles for common project types. Use as starting points — always validate against the conflict registry.

### Profile: Solo Full-Stack Dev
```
Primary: superpowers, code-review-graph, planning-with-files, owasp-security, frontend-design, design-auditor, git-pushing
Project: webapp-testing, claude-skills-65
Total: 9 (superpowers already includes TDD, brainstorming, debugging, git worktrees)
```

### Profile: Backend API
```
Primary: superpowers, code-review-graph, planning-with-files, owasp-security, git-pushing
Project: defense-in-depth
Total: 6 (lean and powerful — superpowers handles debugging + TDD)
```

### Profile: Data/ML
```
Primary: superpowers, socraticode (or graphify for mixed content), planning-with-files
Project: csv-data-summarizer, deep-research
Skip: Frontend skills, git-pushing (notebooks use different workflow)
Total: 5
```

### Profile: DevOps/Infrastructure
```
Primary: superpowers, planning-with-files, owasp-security, git-pushing
Project: hashicorp-agent-skills, defense-in-depth
Skip: Frontend skills, codebase graph (config files don't benefit from AST parsing)
Total: 6
```

### Profile: New/Empty Project
```
Primary: superpowers, planning-with-files, owasp-security, git-pushing
Skip: Codebase awareness (nothing to graph yet), frontend skills (no UI yet)
Add codebase awareness after: 20+ files exist
Total: 4 (minimal — superpowers provides TDD + brainstorming + debugging out of box)
```

### Profile: Code Review / Audit
```
Primary: superpowers, code-review-graph, owasp-security
Project: defense-in-depth, design-auditor (if UI)
Skip: planning (not planning), frontend-design (not building)
Total: 4-5 (superpowers provides verification + review workflows)
```

### Profile: Claude Plugin/Skill Development
```
Primary: superpowers, code-review-graph, planning-with-files, owasp-security
Project: plugin-authoring, skill-creator, mcp-builder
Total: 7
```

---

## Interplay with /scan-project

Skillpilot and `/scan-project` are complementary:

- **Skillpilot** = always-on intelligence layer. Loads automatically, manages skill state continuously, makes quiet decisions.
- **/scan-project** = deep-dive tool. User runs it manually for comprehensive project analysis, interactive approval, and first-time setup.

When the user runs `/scan-project`:
- Skillpilot's conflict registry informs Phase 2.5 (Conflict Detection)
- Skillpilot's project detection feeds Phase 1 (Scan)
- `/scan-project`'s approved skills become Skillpilot's project-adaptive set

When Skillpilot detects a project without running `/scan-project`:
- Use lightweight detection (file extension + config scan)
- Suggest running `/scan-project` for deeper analysis if the project is complex
- Never override `/scan-project`'s approved decisions

---

## Installation Philosophy: Clean Global, Rich Project

**The #1 architectural rule: Keep global skills empty (or near-empty). Install everything at the project level.**

### Why

Global skills are inherited by EVERY project. This means:
- A globally installed `code-review-graph` conflicts with a project that needs `graphify`
- A globally installed `systematic-debugging` duplicates what superpowers already provides
- Every /scan-project run has to work AROUND globals, warning about conflicts it can't actually resolve
- Global skills burn tokens on projects where they're irrelevant

### The Correct Setup

```
GLOBAL (~/.claude/settings.json):
  skills: [skillpilot]        ← ONLY the orchestrator
  plugins: []                  ← nothing forced onto every project

PROJECT (.claude/settings.local.json):
  skills: [superpowers, code-review-graph, planning-with-files, ...]
                               ← tailored per project by /scan-project or skillpilot
```

### What Goes Global (max 1-2 things)

| Install Globally | Why |
|-----------------|-----|
| `skillpilot` | The orchestrator — it needs to be present everywhere to guide skill selection |
| `claude-code-terminal-title` (optional) | Pure cosmetic, zero conflict potential, nice QoL |

Everything else — including superpowers, code intelligence, planning, security — goes at project level.

### What This Enables

1. **Zero conflict warnings in /scan-project** — no globals to clash against
2. **Project-specific Code Intelligence** — graphify for the docs repo, CRG for the API, socraticode MCP for the monorepo
3. **Lean token budget** — each project loads only what it needs, nothing extra
4. **Clean experimentation** — try a new skill in one project without affecting others
5. **Predictable behavior** — what you see in `.claude/settings.local.json` is exactly what's active

### Migration Path (for users with existing global skills)

If you currently have skills installed globally:

1. Run `/scan-project` in each active project — it will generate the correct project-level install
2. After each project has its own `.claude/settings.local.json`, clear globals:
   ```json
   // ~/.claude/settings.json
   {
     "permissions": { ... },
     "skills": ["skillpilot"]
   }
   ```
3. Verify each project still works by opening a session and checking the skill profile

### When /scan-project Detects Globals

If Skillpilot or /scan-project detects globally installed skills:
- **Inform the user** that project-level installation is preferred
- **Suggest migration** — move those skills to `.claude/settings.local.json` in relevant projects
- **Never silently disable** global skills — always explain and get confirmation
- **If the user keeps globals** — respect the choice, but continue warning about conflicts as they arise

---

## Rules

1. **Never recommend conflicting skills.** Check the registry every time. No exceptions.
2. **Fewer skills > more skills.** Token efficiency wins over capability breadth.
3. **Clean global, rich project.** Only skillpilot belongs at global level. Everything else is project-specific.
4. **Primary Group is non-negotiable** (adjusted for project type — skip frontend slots for backend-only, skip codebase awareness for empty projects).
5. **MCP-only is always valid.** When a skill's tools are useful but its directives conflict, suggest MCP-only installation.
6. **Don't announce yourself.** The user should feel smarter skill selection, not see "Skillpilot activating..." messages. Be invisible except at session start.
7. **Adapt to the user.** If they manually activate a skill you wouldn't recommend, respect their choice. Warn about conflicts if relevant, but don't block.
8. **Deactivation is healthy.** Suggest removing skills that haven't been useful. Less loaded context = faster responses.
9. **Project-level is reversible.** Unlike globals that affect everything, project-level mistakes are contained. Encourage experimentation.
