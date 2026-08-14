# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## Commands

No build step and no `package.json` — the scripts are plain `node` and `bash`.

```bash
claude --plugin-dir .    # launch Claude Code with the plugin loaded
```

Run a test — each writes its JSON to `reports/data/`:

```
/kosh:functional-design https://example.com
/kosh:performance https://example.com
/kosh:a11y https://example.com
/kosh:shop https://example.com
/kosh:aeo https://example.com
```

Render a report to self-contained HTML:

```bash
scripts/run-qa-report.sh reports/data/qa-report-functional.json   # type from filename, except aeo
node scripts/generate-report.js reports/data/qa-report-aeo.json   # or call the renderer directly
scripts/merge-qa-reports.sh                                       # or /kosh:merge
```

`run-qa-report.sh` also archives the source JSON to `reports/data/archive/`, under
the same basename as the HTML it generated. `reports/data/qa-report-<type>.json`
is a fixed name that every run overwrites, so without this the evidence behind a
finished report is destroyed by the next test — the HTML survives, its source data
did not. Sharing the basename means you can get from a report to its exact input
and back. A same-day rerun with different content gets the run timestamp appended
rather than overwriting.

Merging requires all three of functional, performance, and accessibility; shop and AEO reports are standalone. Prefer `/kosh:merge` over calling the script — it reports which JSON files are missing up front, where the script exits on the first one it can't find.

`run-qa-report.sh` has no aeo branch in its filename detection, so AEO reports fall through to the renderer's own dispatch: it routes on `mode: "aeo"` in the JSON. An AEO-shaped report missing that field is a hard error, not a fallback.

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

`commands/merge.md` is the exception — it has no skill or schema, and runs `scripts/merge-qa-reports.sh` after a pre-flight check for the three input reports.

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
