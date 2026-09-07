# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## Commands

No build step and no root `package.json` — the scripts are plain `node` and `bash`. `evals/` has its own `package.json` for promptfoo.

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

`run-qa-report.sh` also copies the source JSON to `reports/data/archive/` under the same basename as the HTML it generated, since `reports/data/qa-report-<type>.json` is overwritten by every run. A same-day rerun with different content moves the previous run's copy aside with its timestamp appended, so the un-suffixed JSON is always the source of the current HTML.

Merging requires all three of functional, performance, and accessibility; shop and AEO reports are standalone. Prefer `/kosh:merge` over calling the script — it reports which JSON files are missing up front, where the script exits on the first one it can't find.

`run-qa-report.sh` has no aeo branch in its filename detection, so AEO reports fall through to the renderer's own dispatch: it routes on `mode: "aeo"` in the JSON. An AEO-shaped report missing that field is a hard error, not a fallback.

## How it works

Each test is a **skill** (`skills/`), invoked directly as `/kosh:<name>`. The skill parses the URL and environment type from user input, then carries the full testing procedure — what to check, how to check it, and how to report findings. Results follow the structure defined in a **schema** (`schemas/`) and are saved as JSON reports, which are then rendered to self-contained HTML reports via scripts in `scripts/`.

Skills and commands share one `/kosh:` namespace, so a command named after a skill makes that entry appear twice in the slash menu. Tests are skills only; `commands/` holds `merge.md` alone.

```
commands/        → merge only — a skill of the same name would double the menu entry
skills/          → detailed testing procedures (the actual prompts)
schemas/         → JSON schemas that define report structure
scripts/         → report generation and merge scripts
hooks/           → session hooks (e.g., create reports/data/ on startup)
evals/           → promptfoo regression checks for skill decision rules (evals/README.md)
docs/            → user-facing guides (getting-started.md)
.mcp.json        → Playwright MCP server configuration
.claude/         → project settings and Playwright tool permissions
.claude-plugin/  → plugin manifest (plugin.json)
```

### How skills and schemas relate

Each test type has a matching set of files:

| Test | Skill | Schema |
|---|---|---|
| Functional & design | `skills/functional-design/SKILL.md` | `schemas/qa-report-functional-schema.json` |
| Performance | `skills/performance/SKILL.md` | `schemas/qa-report-performance-schema.json` |
| Accessibility | `skills/a11y/SKILL.md` | `schemas/qa-report-accessibility-schema.json` |
| Shop (WooCommerce) | `skills/shop/SKILL.md` | `schemas/qa-report-shop-schema.json` |
| AEO / AI mode | `skills/aeo/SKILL.md` | `schemas/qa-report-aeo-schema.json` |

If you add a new test type, you need both: a skill and a schema. Do not add a matching command — the name would collide.

`commands/merge.md` is the exception — it has no skill or schema, and runs `scripts/merge-qa-reports.sh` after a pre-flight check for the three input reports.

## Contributing

### Adding or editing a skill

Skill files are long, detailed prompts — not code. They tell Claude exactly what to test, in what order, and how to report it. When editing a skill:

- Keep instructions explicit and mandatory. Claude follows these literally, so vague language leads to inconsistent results.
- Use `- ✅` for mandatory requirement declarations (things Claude must do, stated upfront as rules). Use `- [ ]` for completion tracking checklists (things Claude checks off as it works, used as a gate before report generation). Both patterns appear in skill files and serve different purposes.
- Maintain the existing phase structure (setup → multi-page testing → analysis → reporting).
- Open with the shared `$ARGUMENTS` preamble: parse the URL, validate it is present (ask the user if not), and resolve the environment type.
- Test your changes by running the skill against a real site and reviewing the report. For `functional-design`, also run the promptfoo evals — see `evals/README.md`.

### Adding or editing a schema

Schemas define the structure of the JSON reports. If you change what a skill collects, update the matching schema. The report generation scripts (`scripts/generate-report.js`) depend on this structure.

## Git workflow

- **Main branch:** `trunk`
- **Branch prefixes:** `feature/`, `fix/`, `update/`, `add/`, `remove/`
- **Commit style:** conventional commits — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Merge strategy:** squash merge preferred for feature branches
- **PR requirements:** clear title, description of what changed and why
