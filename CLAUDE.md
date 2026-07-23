# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## How it works

Each test is triggered by a **command** (`commands/`) which parses user input and delegates to a **skill** (`skills/`). The skill contains the full testing procedure — what to check, how to check it, and how to report findings. Results follow the structure defined in a **schema** (`schemas/`) and are saved as JSON reports, which are then rendered to self-contained HTML reports via scripts in `scripts/`.

```
commands/        → parse input, delegate to a skill
skills/          → detailed testing procedures (the actual prompts)
schemas/         → JSON schemas that define report structure
scripts/         → report generation and merge scripts
hooks/           → session hooks (e.g., create reports/data/ on startup)
docs/            → user-facing guides (getting-started.md)
.mcp.json        → Playwright MCP server configuration
.claude/         → project settings and Playwright tool permissions
.claude-plugin/  → plugin manifest (plugin.json)
```

### How commands, skills, and schemas relate

Each test type has a matching set of files:

| Test | Command | Skill | Schema |
|---|---|---|---|
| Functional & design | `commands/functional-design.md` | `skills/functional-design/SKILL.md` | `schemas/qa-report-functional-schema.json` |
| Performance | `commands/performance.md` | `skills/performance/SKILL.md` | `schemas/qa-report-performance-schema.json` |
| Accessibility | `commands/a11y.md` | `skills/a11y/SKILL.md` | `schemas/qa-report-accessibility-schema.json` |
| Shop (WooCommerce) | `commands/shop.md` | `skills/shop/SKILL.md` | `schemas/qa-report-shop-schema.json` |
| AEO / AI mode | `commands/aeo.md` | `skills/aeo/SKILL.md` | `schemas/qa-report-aeo-schema.json` |

If you add a new test type, you need all three: a command, a skill, and a schema.

## Contributing

### Adding or editing a skill

Skill files are long, detailed prompts — not code. They tell Claude exactly what to test, in what order, and how to report it. When editing a skill:

- Keep instructions explicit and mandatory. Claude follows these literally, so vague language leads to inconsistent results.
- Use `- ✅` for mandatory requirement declarations (things Claude must do, stated upfront as rules). Use `- [ ]` for completion tracking checklists (things Claude checks off as it works, used as a gate before report generation). Both patterns appear in skill files and serve different purposes.
- Maintain the existing phase structure (setup → multi-page testing → analysis → reporting).
- Test your changes by running the command against a real site and reviewing the report.

### Adding or editing a command

Commands are short files that parse `$ARGUMENTS` and delegate to a skill. They should:

1. Parse the URL and optional environment type from `$ARGUMENTS`.
2. Validate that a URL is present (ask the user if not).
3. Reference the corresponding skill file.

### Adding or editing a schema

Schemas define the structure of the JSON reports. If you change what a skill collects, update the matching schema. The report generation scripts (`scripts/generate-report.js`) depend on this structure.

## Git workflow

- **Main branch:** `trunk`
- **Branch prefixes:** `feature/`, `fix/`, `update/`, `add/`, `remove/`
- **Commit style:** conventional commits — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Merge strategy:** squash merge preferred for feature branches
- **PR requirements:** clear title, description of what changed and why
