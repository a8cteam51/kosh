# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## Commands

No build step — the scripts are plain `node` and `bash`. The root `package.json` has one dependency, `ajv`, for report validation; `evals/` has its own `package.json` for promptfoo. Install with `npm ci`, which never rewrites the committed lockfile — a rewritten one would block the user's next `git pull`. `npm install <pkg>` is only for adding a dependency.

```bash
npm ci                   # once after cloning, and after any pull
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
scripts/run-qa-report.sh reports/data/qa-report-functional.json   # type from filename
scripts/run-qa-report.sh reports/data/qa-report-aeo.json --aeo    # aeo comes from the flag or mode: "aeo"
node scripts/generate-report.js reports/data/qa-report-aeo.json   # renderer only: validates, skips the stamp and the archive
node --test "tests/*.test.js"                                     # script, snippet, JSON-file, schema-drift, validation and fixture tests
```

`.github/workflows/ci.yml` runs `npm ci` and that same `node --test` line on every PR and on pushes to `trunk` — no API calls. The promptfoo evals stay manual because they cost money.

`generate-report.js` validates the report against its schema (`scripts/validate-report.js`, ajv) before rendering, so the check runs on every render path: `run-qa-report.sh` and a direct call. A report that doesn't match is refused — nothing is rendered or archived, and ajv's errors name each field, so the skill that wrote the JSON can fix it and re-run. `run-qa-report.sh` stamps provenance first, so a refused report comes back stamped with its own fields untouched. The types checked are the flagged ones plus any the content shows — `mode: "aeo"`, a `shop` block, or console and network data under `mobile`/`desktop` (performance) — so leaving a flag out or passing the wrong one doesn't skip the check. Only a schema file that declares `$schema` is validated — shop, aeo and performance today; functional and accessibility are still example documents and pass through with a note. Schemas must compile in ajv strict mode. `node scripts/generate-report.js <json> --skip-validation` renders without the check, which is how to re-render an archived report in an older shape; it's a renderer flag, not a `run-qa-report.sh` one, since the wrapper would also re-stamp and re-archive.

`run-qa-report.sh` stamps a `provenance` block into the source JSON before rendering: the skill writes `provenance.model` (self-reported), and `scripts/stamp-provenance.js` adds `pluginVersion`, a SHA-256 of each skill directory (references included), and a `seal` over those plus the report's `timestamp`. A valid seal means the block is never restamped, so re-rendering an archived run keeps the provenance of the run that produced it; a model-invented or copied-forward block fails the seal and is restamped. The seal is an unkeyed hash, so it guards against accidents, not deliberate tampering — anything with a shell can recompute it. A report with no `provenance` block at all is left untouched with a warning — it predates the feature, or the skill skipped `provenance.model`. The renderer prints the block as one footer line, and nothing for reports that predate it.

`run-qa-report.sh` also copies the source JSON to `reports/data/archive/` under the same basename as the HTML it generated, since `reports/data/qa-report-<type>.json` is overwritten by every run. A same-day rerun with different content moves the previous run's copy aside with its timestamp appended, so the un-suffixed JSON is always the source of the current HTML.

The renderer inlines each finding's screenshots as base64, because every run shares `reports/screenshots/` and a later run can overwrite a file an older report points at. Only image files inside `reports/` are read, and an inlined image expands in place through a CSS-only `<details>` toggle because a `data:` URI can't be a link target. A missing file keeps its external `src` with a warning; a remote, absolute, scheme-carrying or `../` path is dropped with a warning, so only paths inside `reports/` ever reach the HTML. The generator prints the inlined count and the HTML's size. The archived JSON still holds the shared-folder paths, so re-rendering an old run embeds whatever is at those paths now.

`reports/` lives next to `scripts/`, and every script resolves it from its own location, never from the cwd; `tests/reports-dir.test.js` runs `run-qa-report.sh` from a foreign cwd to keep it that way. Skills are the exception: they write `reports/…` and call `scripts/*.sh` cwd-relative, which is why the documented launch is `cd kosh && claude --plugin-dir .`. `KOSH_REPORTS_DIR` redirects the scripts only — the tests use it to stay out of the real directory — and does not move where the skills write, so setting it for a real run leaves the renderer looking for screenshots the skill saved somewhere else. The SessionStart hook pre-creates the folders as a nicety; nothing depends on it.

With no flag, `run-qa-report.sh` takes the test type from the filename, and for AEO from `mode: "aeo"` in the JSON, so validation, the stamp and the renderer all get `--aeo` even when the skill forgets to pass it. A report with neither is rendered with a "not validated" note. An AEO-shaped report missing `mode` is a hard error in the renderer, not a fallback. A report has one type, so the stamp refuses more than one type flag or any other flag and leaves the report unsealed, and the renderer refuses the same plus any flag it doesn't know (`--skip-validation` aside).

## How it works

Each test is a **skill** (`skills/`), invoked directly as `/kosh:<name>`. The skill parses the URL and environment type from user input, then carries the full testing procedure — what to check, how to check it, and how to report findings. Results follow the structure defined in a **schema** (`schemas/`) and are saved as JSON reports, which are then rendered to self-contained HTML reports via scripts in `scripts/`.

Skills and commands share one `/kosh:` namespace, so a command named after a skill makes that entry appear twice in the slash menu.

```
skills/          → detailed testing procedures (the actual prompts)
schemas/         → JSON schemas that define report structure
scripts/         → report generation, validation and provenance scripts
hooks/           → session hooks (e.g., create reports/data/ on startup)
evals/           → promptfoo regression checks for skill decision rules (evals/README.md)
tests/           → `node --test` checks for the scripts, skill-embedded snippets, tracked JSON files, skill ↔ schema drift, report validation and redacted real reports (`tests/fixtures/`)
docs/            → user-facing guides (getting-started.md)
.github/         → the CI workflow (runs tests/ on every PR)
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

In the performance schema, URLs kosh navigated to (`url`, `visitedPages`, `mobile`/`desktop.url`, a finding's `pages`) use its `webUrl` definition, http(s) only; shop and aeo adopt it when they're rewritten. URLs read off the site, like a failed request's, stay plain strings: a malformed one is something to report, and a schema that refused it would push the skill to "fix" the site's data in the JSON.

`tests/fixtures/` holds real reports that must keep passing their schema (`tests/fixtures.test.js`), so a schema edit that would refuse a real run fails CI. A fixture kept to show a refusal pins its exact errors in that test's `EXPECTED_ERRORS` instead, as `performance-opus-5-run-1.json` does for its invented `summary`. The repo is public, so a fixture keeps only its shape: hostnames become example domains, identifying page slugs generic ones, the site name `Example Site`, and free text placeholder text. The test fails on any hostname, IP address or `localhost` but an example domain; it can't catch a name.

## Git workflow

- **Main branch:** `trunk`
- **Branch prefixes:** `feature/`, `fix/`, `update/`, `add/`, `remove/`
- **Commit style:** conventional commits — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Merge strategy:** squash merge preferred for feature branches
- **PR requirements:** clear title, description of what changed and why
