# Project Profiles — Detection Heuristics & Skill Maps

## Detection Signals

### File-Based Detection (fast — check these first)

| File/Pattern | Strong Signal For |
|-------------|-------------------|
| `next.config.*` | Next.js fullstack |
| `vite.config.*` | Frontend SPA (React/Vue/Svelte) |
| `tailwind.config.*` | UI-heavy project |
| `tsconfig.json` + `src/` | TypeScript project |
| `pyproject.toml` / `setup.py` | Python project |
| `Cargo.toml` | Rust project |
| `go.mod` | Go project |
| `Gemfile` | Ruby/Rails project |
| `docker-compose.yml` | Multi-service / DevOps |
| `terraform/` / `*.tf` | Infrastructure-as-Code |
| `.github/workflows/` | CI/CD enabled |
| `hardhat.config.*` / `foundry.toml` | Blockchain/Web3 |
| `unity*/` / `*.unity` | Game dev (Unity) |
| `*.ipynb` | Data science / ML |
| `.mcp.json` / `mcp.json` | MCP-aware project |
| `CLAUDE.md` / `.claude/` | Claude Code project |

### Dependency-Based Detection (read package.json/pyproject.toml)

| Dependency | Indicates |
|-----------|-----------|
| react, vue, svelte, angular | Frontend framework |
| express, fastify, hono, nestjs | Node.js backend |
| prisma, drizzle, typeorm | Database layer |
| pytest, jest, vitest, mocha | Testing infrastructure |
| torch, tensorflow, sklearn | ML/AI |
| ethers, web3, viem | Blockchain |
| aws-cdk, pulumi | Cloud infrastructure |

### Size-Based Heuristics

| Project Size | Codebase Awareness | Planning Need |
|-------------|-------------------|---------------|
| < 20 files | Skip code graph — overhead exceeds benefit | Light planning |
| 20-200 files | Code graph recommended | Standard planning |
| 200-1000 files | Code graph essential | Thorough planning |
| 1000+ files | Code graph + vector search (MCP-only socraticode) | Mandatory planning |

## Full Profile Definitions

### Frontend SPA
```
Signals: vite.config.* OR react/vue/svelte in deps, NO backend framework
Primary Group adjustments:
  - Activate: frontend-design, design-auditor
  - Code awareness: code-review-graph (for component relationships)
Project additions:
  - webapp-testing (if test infrastructure exists)
  - playwright-skill (for E2E)
Token strategy: Component-level graph queries, avoid reading entire component trees
```

### Next.js / Full-Stack
```
Signals: next.config.* OR next in deps
Primary Group adjustments:
  - Activate: frontend-design, design-auditor
  - Code awareness: code-review-graph
Project additions:
  - webapp-testing, vercel-agent-skills
  - defense-in-depth (API routes need security)
Token strategy: Separate client/server mental models, graph both
```

### Pure Backend API
```
Signals: express/fastify/hono/nestjs in deps, NO frontend framework
Primary Group adjustments:
  - Skip: frontend-design, design-auditor
  - Code awareness: code-review-graph
Project additions:
  - systematic-debugging
  - defense-in-depth
  - Database skill (postgres/mysql/mssql based on deps)
Token strategy: Focus on endpoint→handler→service→DB flow. Graph excels here.
```

### Python Data/ML
```
Signals: torch/tensorflow/sklearn/pandas in deps OR .ipynb files
Primary Group adjustments:
  - Skip: TDD (experimental workflow), frontend skills, git workflow
  - Code awareness: socraticode (vector search for large datasets) OR graphify (if papers/PDFs involved)
Project additions:
  - csv-data-summarizer-claude-skill
  - deep-research
Token strategy: Notebooks are self-documenting — read less, execute more
```

### Infrastructure / DevOps
```
Signals: *.tf files, docker-compose.yml, .github/workflows/, kubernetes manifests
Primary Group adjustments:
  - Skip: frontend skills, TDD
  - Keep: planning (infra changes are high-stakes), owasp-security
Project additions:
  - hashicorp-agent-skills (if Terraform)
  - defense-in-depth
  - using-git-worktrees (infra changes need isolation)
Token strategy: Config files are small — less need for code graph. Focus on dependency analysis.
```

### Claude Code Plugin/Skill
```
Signals: SKILL.md, plugin.json, skills/ directory, .claude/ config
Primary Group adjustments:
  - Code awareness: code-review-graph (skill files are interconnected)
Project additions:
  - plugin-authoring
  - skill-creator
  - mcp-builder (if MCP involved)
Token strategy: Skills are small — full file reads are cheap. Focus on testing.
```

### Empty / New Project
```
Signals: No package.json, no config files, < 5 files total
Primary Group adjustments:
  - Skip: Code awareness (nothing to index), frontend skills (no UI yet)
  - Keep: planning-with-files, brainstorming, TDD, owasp-security, git-pushing
Project additions: None until project takes shape
Token strategy: Minimal — you're creating, not navigating
Re-evaluate after: 20+ files created
```

## Profile Evolution

Projects change. Skillpilot should re-evaluate when:
- Major new dependencies added (npm install, pip install)
- New directory patterns emerge (src/components/ = frontend, src/api/ = backend)
- File count crosses a threshold (20 files = add code graph, 200 = add vector search)
- User explicitly shifts focus ("now let's add a frontend")

Don't re-scan every interaction — check when the user's task implies a domain shift.
