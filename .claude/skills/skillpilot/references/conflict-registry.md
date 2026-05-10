# Conflict Registry — Quick Reference

This is the authoritative conflict database for Skillpilot. When adding new skills to the library, update this file.

Last updated: 2026-05-05

## Mutual Exclusion Groups

### Code Intelligence (CRITICAL — never violate)

Members: `graphify`, `socraticode`, `code-review-graph`

| Combo | Verdict | Reason |
|-------|---------|--------|
| graphify + socraticode | BLOCKED | Both parse ASTs (tree-sitter vs ast-grep), both override file-reading strategy |
| graphify + code-review-graph | BLOCKED | Both use tree-sitter, both build graphs, both override navigation |
| socraticode + code-review-graph | BLOCKED as skills | Both override "query X before reading files" |
| code-review-graph (skill) + socraticode (MCP-only) | ALLOWED | MCP has no directives, no competing instructions |
| graphify (skill) + socraticode (MCP-only) | ALLOWED | Same pattern — MCP-only bypasses directive conflicts |
| Any single one alone | ALLOWED | No conflict with itself |

### Debugging Strategy (MEDIUM — warn, allow override)

Members: `systematic-debugging`, `root-cause-tracing`

| Combo | Verdict | Reason |
|-------|---------|--------|
| systematic-debugging + root-cause-tracing | WARN | Both direct code navigation; use systematic as primary, root-cause for deep traces only |
| Either + code-review-graph | OK | CRG's blast radius complements debugging — different angles |
| socraticode + root-cause-tracing | BLOCKED | SocratiCode's impact analysis fully overlaps root-cause-tracing |

## Pairwise Conflict Table

Severity scale: HIGH (must disable one), MEDIUM (warn + suggest primary), LOW (note only), NONE (complementary)

| Skill A | Skill B | Severity | Winner Rule |
|---------|---------|----------|-------------|
| graphify | socraticode | HIGH | Pick based on project: multi-modal → graphify, code-only → socraticode |
| graphify | code-review-graph | HIGH | Pick based on goal: exploration → graphify, review → CRG |
| socraticode | code-review-graph | HIGH/LOW | If both needed: CRG as skill, socraticode as MCP-only |
| code-review-graph | root-cause-tracing | MEDIUM | CRG covers blast radius; keep root-cause for execution chain tracing |
| socraticode | root-cause-tracing | HIGH | SocratiCode fully subsumes root-cause functionality |
| systematic-debugging | root-cause-tracing | MEDIUM | Systematic = primary workflow, root-cause = escalation tool |
| planning-with-files | brainstorming | NONE | Complementary: plan = structure, brainstorm = diverge |
| frontend-design | design-auditor | NONE | Complementary: create vs validate |
| TDD | systematic-debugging | NONE | Complementary: prevent vs fix |
| TDD | code-review-graph | NONE | Complementary: quality at write-time vs review-time |
| owasp-security | defense-in-depth | LOW | OWASP = baseline awareness, DID = full hardening. Both fine. |
| owasp-security | trailofbits-security-skills | LOW | Trail of Bits adds depth; no conflict with baseline OWASP |
| planning-with-files | code-review-graph | NONE | Plan the work, review the result — perfect pipeline |
| brainstorming | deep-research | NONE | Brainstorm = internal ideation, research = external gathering |

## Remediation Playbook

Specific, copy-paste remedies for every known HIGH/MEDIUM conflict.

### graphify + code-review-graph (HIGH)

**Symptom:** Both generate `.code-review-graph/` and `.graphify/` databases, both hook into git, Claude receives contradictory "query my graph first" directives.

**Remedy options (pick one):**
```
Option A: Keep CRG, remove graphify
  - Remove: rm -rf .claude/skills/graphify
  - Or disable: add "graphify" to disabledSkills in .claude/settings.local.json

Option B: Keep graphify, remove CRG
  - Remove: rm -rf .claude/skills/code-review-graph
  - Or disable: add "code-review-graph" to disabledSkills in .claude/settings.local.json

Option C (rare): graphify for this project, CRG globally
  - Disable CRG at project level in .claude/settings.local.json
  - Install graphify at project level in .claude/skills/
```

### code-review-graph + socraticode (HIGH → LOW with MCP-only)

**Symptom (as dual skills):** Both parse ASTs, both override navigation, double processing.

**Remedy:**
```
Keep code-review-graph as SKILL (full directives + hooks).
Convert socraticode to MCP-only:

1. Remove from skills: rm -rf .claude/skills/socraticode
2. Add to .mcp.json:
   {
     "mcpServers": {
       "socraticode": {
         "command": "uvx",
         "args": ["socraticode", "serve"],
         "env": {}
       }
     }
   }
3. Verify: socraticode MCP has NO `instructions` field — confirmed clean.
   Tools are available on-demand without competing directives.
```

### graphify + socraticode (HIGH → LOW with MCP-only)

**Symptom:** Same as above — dual AST, dual navigation override.

**Remedy:** Same pattern — keep graphify as SKILL, convert socraticode to MCP-only (same `.mcp.json` config as above).

### superpowers + standalone systematic-debugging (REDUNDANT)

**Symptom:** Superpowers already includes systematic-debugging. Having both loaded means the directive appears twice, wasting context tokens.

**Remedy:**
```
Remove standalone: rm -rf .claude/skills/systematic-debugging
(Already included in superpowers bundle — zero capability loss)
```

### superpowers + standalone root-cause-tracing (REDUNDANT)

**Remedy:**
```
Remove standalone: rm -rf .claude/skills/root-cause-tracing
(Already included in superpowers bundle)
```

### superpowers + standalone test-driven-development (REDUNDANT)

**Remedy:**
```
Remove standalone: rm -rf .claude/skills/test-driven-development
(Already included in superpowers bundle)
```

### code-review-graph + root-cause-tracing (MEDIUM)

**Symptom:** CRG's blast radius + flow analysis covers most of what root-cause-tracing does. Having both adds context weight with minimal benefit.

**Remedy:**
```
Option A (preferred): Remove root-cause-tracing — CRG subsumes it
Option B: Keep both but scope — use CRG for navigation, root-cause only when
  explicitly tracing deep multi-layer execution chains that CRG can't follow
```

### graphify + planning-with-files (MEDIUM)

**Symptom:** Graphify indexes planning docs (task_plan.md, findings.md) into its graph, adding noise to code queries.

**Remedy:**
```
Create/update .graphifyignore at project root:
  task_plan.md
  findings.md
  progress.md
  *.plan.md
  docs/plans/
```

### socraticode + planning-with-files (LOW)

**Remedy:**
```
Create/update .socraticodeignore at project root:
  task_plan.md
  findings.md
  progress.md
```

### owasp-security + defense-in-depth (LOW — both OK)

**Symptom:** Minor overlap in security guidance. No directive collision.

**Remedy:** None needed. OWASP is baseline awareness; defense-in-depth adds architectural hardening. Complementary, not conflicting.

### claude-skills-65 + individual framework skills (REDUNDANT)

**Symptom:** claude-skills-65 already includes react-expert, nestjs-expert, python-pro, etc. Installing the individual version alongside the bundle wastes context.

**Remedy:**
```
Check if the individual skill is covered by claude-skills-65's 65-skill bundle.
If yes: remove the individual.
If no (niche skill not in the bundle): keep both.
```

---

## Adding New Conflicts

When a new skill is added to the library:

1. Check: does it parse ASTs or build code graphs? → Check against Code Intelligence group
2. Check: does it override Claude's file-reading strategy? → Check against navigation overrides
3. Check: does it direct debugging/tracing approach? → Check against Debugging Strategy group
4. Check: does it inject behavioral directives via MCP `instructions` field? → Note as potential conflict source
5. Check: is it already included in a bundle (superpowers, claude-skills-65)? → Mark as REDUNDANT if installed alongside bundle
6. If no conflicts found → mark as NONE against all existing skills
7. Write a remediation entry in this file with specific commands
8. Update this file + the SKILL.md conflict table
