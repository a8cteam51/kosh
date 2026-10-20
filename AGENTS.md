# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## Commands

Installing and running kosh is in `docs/getting-started.md`; these are for changing it.

No build step — the scripts are plain `node` and `bash`. The root `package.json` has one dependency, `ajv`, for report validation, and one devDependency, `jsdom`, for the collector tests; `evals/` has its own `package.json` for promptfoo. Install with `npm ci`: `npm install` rewrites the committed lockfile, which blocks the next `git pull`, so it's only for adding a dependency.

```bash
npm ci                                                     # once after cloning, and after any pull
node --test "tests/*.test.js"                              # every test; CI runs the same line
node scripts/generate-report.js tests/fixtures/performance-opus-5-5-2026-10-14.json --performance  # renderer only: validates, skips the stamp and the archive
node scripts/page-capture.js summary https://example.com/ [<page>…]  # the rows a performance report's pages[] would get now
node scripts/compare-runs.js reports/data/archive/<name>.json…       # one block of rows per archived performance run
```

`.github/workflows/ci.yml` runs `npm ci` and the tests on every PR and on pushes to `trunk`, with no API calls. The promptfoo evals stay manual because they cost money.

## How a report is produced

1. A skill drives the browser through Playwright MCP and writes `reports/data/qa-report-<type>.json`. Meanwhile `collectors/capture.js` records every page the browser loads (timings, LCP and CLS, console errors, failed requests, tagging `byModel` those the model's own `browser_evaluate` made, from Chrome's initiator stack) into `reports/data/capture-<session id>.jsonl`.
2. `scripts/run-qa-report.sh` then, for that skill's own output:
   - merges the capture (`scripts/page-capture.js merge`), and for performance rebuilds `pages[]` from it, replacing anything the model wrote;
   - stamps `provenance` (`scripts/stamp-provenance.js`): plugin version, skill and `collectors/` hashes, the Playwright MCP args, the model and effort from the session's transcript, and a seal;
   - renders (`scripts/generate-report.js`), which validates against the schema first (`scripts/validate-report.js`) and refuses a mismatch, naming each field;
   - archives the JSON and the capture in `reports/data/archive/` under the HTML's name, then deletes the source so the next run writes a new file.
3. Any other report is stamped without the session's facts, rendered and copied to the archive, but never deleted, and nothing is merged.

Things that catch contributors out:

- `hooks/guard-capture.js` refuses edits to `capture*.jsonl` files and anything naming this session's capture. For commands that can reach a `reports/` kosh has run in (one holding a capture: anywhere in the session's project, or a run folder or a path in its `reports/` named by absolute path), it also refuses `*.jsonl` globs and any `rm` or `mv` of `reports/`, `reports/data`, the archive, or a glob of their contents, so clearing them is done by hand.
- The merge keeps only the visits from the last browser that loaded the report's host, since a performance run starts with `browser_close`. A skill that closes the browser mid-run drops what it measured before.
- `reports/` is the project's, not kosh's: `$CLAUDE_PROJECT_DIR/reports`, which Claude Code sets for the capture and the hooks. Bash commands don't get it, so the scripts use the nearest `reports/data` at or above the cwd, looking no higher than the git root, else `reports/` in the cwd. A `reports/` kosh creates gets a `.gitignore` of `*`, since reports hold client URLs and console text. Schemas, skills and `plugin.json` still resolve from kosh's own folder. `KOSH_REPORTS_DIR` moves where the scripts and the capture look (the tests use it), not where the skills write.

## Playwright MCP (`plugin.json`)

`.claude-plugin/plugin.json` declares the server, and JSON can't hold comments, so its reasons live here. `tests/mcp-config.test.js` pins all of it. There's no `.mcp.json`: in a clone, a project one starts a second browser beside the plugin's.

- The version is pinned: `@latest` would make it an unrecorded input to every run, so a bump is its own PR. A bump must check that `browser_evaluate` still passes its code to ``eval(`(${expr})`)``, which is how `capture.js` recognizes the model's requests; if it doesn't, they quietly read as the site's.
- `--isolated` keeps the browser profile in memory, so no cache, cookies or logins carry over from an earlier session.
- `--no-webmcp` stops a tested page from registering tools the model could call.
- `--init-script` loads `collectors/kosh.js`, a frozen `window.__kosh` in every page; `--init-page` runs `collectors/capture.js` in Node for every tab. Both are `${CLAUDE_PLUGIN_ROOT}` paths: a relative one resolves against the folder Claude Code starts in, and Playwright won't start if the file isn't there. `capture.js` must never throw, since an init-page error breaks every browser tool, and an edit to it needs a server restart.
- `--output-dir ${CLAUDE_PLUGIN_DATA}/playwright-mcp` keeps the files Playwright names itself (page snapshots, console logs) out of the user's project, where `git add` would pick up client pages. A file given a name, like a screenshot, still resolves against the project. That folder survives plugin updates and holds every project's page text, so `--output-max-size` has Playwright delete the oldest files past 20 MB.
- Every `browser_*` tool a skill names must be in `.claude/settings.json`'s allowlist as `mcp__plugin_kosh_playwright__<tool>`, or it prompts mid-run.

## How it works

Each test is a **skill** (`skills/`), invoked directly as `/kosh:<name>`. The skill parses the URL and environment type from user input, then carries the full testing procedure — what to check, how to check it, and how to report findings. Results follow the structure defined in a **schema** (`schemas/`) and are saved as JSON reports, which are then rendered to self-contained HTML reports via scripts in `scripts/`.

```
skills/          → detailed testing procedures (the actual prompts)
schemas/         → JSON schemas that define report structure
shared/          → canonical blocks every skill carries a verbatim copy of (never read at runtime)
collectors/      → code Playwright MCP loads: `kosh.js` into every page as `window.__kosh` (tested with jsdom), `capture.js` in Node for every tab (tested with a stub page)
scripts/         → report generation, validation, provenance, the page-capture merge, summary and archive, and the run comparison
hooks/           → the SessionStart update check and the PreToolUse capture guard
evals/           → promptfoo regression checks for skill decision rules (evals/README.md)
tests/           → `node --test` checks for the scripts, the collectors, the capture and its guard, skill-embedded snippets, shared-block copies, Claude Code-only constructs in skills, tracked JSON files, the Playwright MCP flags and allowlist, the promptfoo eval wiring, skill ↔ schema drift, report validation and redacted real reports (`tests/fixtures/`)
docs/            → user-facing guides (getting-started.md)
.github/         → the CI workflow (runs tests/ on every PR)
.claude/         → project settings and Playwright tool permissions
.claude-plugin/  → plugin manifest (plugin.json), which declares the Playwright MCP server (see above)
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

If you add a new test type, you need both: a skill and a schema. Do not add a matching command: skills and commands share one `/kosh:` namespace, so the entry would appear twice in the slash menu.

## Contributing

### Adding or editing a skill

A skill is a prompt the model reads once and follows for the whole run. `skills/performance/SKILL.md` is the template the other four move to as they're rewritten; until then they keep their older style. A rewritten skill:

- Follows this outline, in prose with the reason for each rule, because a model given the why handles the case the rule didn't name: the shared preamble; a two-sentence role saying what a finding is; the environment table; the shared gate check; the pages to cover and the floor, stated once; what to test, phase by phase, with what counts and what doesn't; the severity guide with its reasons and two or three "not a finding / a finding" lines; the report section. No `MANDATORY` blocks, `- ✅` rule lists, `- [ ]` checklists or closing reminders: the schema, which refuses a report that doesn't match, and the rendered tables are the gate.
- Leaves measuring to code. Numbers come from the collectors and the page capture, and the model reads them (the performance skill through `scripts/page-capture.js summary`) rather than transcribing them: a number the model copies is a number it can get wrong. The model's report holds its judgment: findings with a cause, `testMethodology`, and `explorationPass` for anything beyond the checks.
- Points at its schema as the contract and shows one labelled illustrative example, with placeholders where a copied value would do harm (the timestamp, the model ID). `tests/schema-drift.test.js` validates the example.
- Carries the blocks in `shared/` as verbatim copies, because skills can't include files and a skill folder must hold everything it runs: every skill carries the preamble, the gate check and the `provenance.model` line, and the skills in `CARRIERS` in `tests/shared-blocks.test.js` carry the others (the screenshot rule, performance only so far). Edit the `shared/` file and every copy together; the test fails otherwise.
- Write a path to kosh's own files (`scripts/`, `schemas/`, `collectors/`, a skill's references) as `<kosh>/…`. The shared preamble defines `<kosh>` as the folder two above the skill's, because a skill runs from the user's project, where `reports/` goes, not from kosh's folder. `tests/portability.test.js` fails on a bare one.
- Don't add Claude Code-only constructs (host tool names like `PushNotification`, `/kosh:` references, `mcp__` tool names, `CLAUDE_…` variables, `$ARGUMENTS`, "Claude prompt"): other hosts load skill text verbatim. `tests/portability.test.js` holds today's count per file, counting each `shared/` block once in `shared/` rather than in every copy; lower a count when a rewrite removes one, never raise it.
- Put page-side code in `collectors/kosh.js` and call it from the skill in one line (`() => __kosh.<name>(…)`), not as a multi-line `javascript` block. `tests/skill-snippets.test.js` holds today's count of multi-line blocks per file; lower it when a block moves out, never raise it.
- Test your changes by running the skill against a real site and reviewing the report. For `functional-design` and `performance`, also run the promptfoo evals — see `evals/README.md`.

### Adding or editing a schema

Schemas define the structure of the JSON reports. If you change what a skill collects, update the matching schema. The report generation scripts (`scripts/generate-report.js`) depend on this structure. Only a schema that declares `$schema` is validated (shop, aeo and performance today; functional and accessibility are still example documents), and it must compile in ajv strict mode.

In the performance schema, URLs kosh navigated to (`url`, `visitedPages`, `pages[].url`, a finding's `pages`) use its `webUrl` definition, http(s) only; shop and aeo adopt it when they're rewritten. URLs read off the site, like a failed request's, stay plain strings: a malformed one is something to report, and a schema that refused it would push the skill to "fix" the site's data in the JSON.

`tests/fixtures/` holds real reports that must keep passing their schema (`tests/fixtures.test.js`), so a schema edit that would refuse a real run fails CI. A fixture kept to show a refusal pins its exact errors in that test's `EXPECTED_ERRORS` instead, as the three performance runs from before `pages[]` do for their shape (and `performance-opus-5-run-1.json` for its invented `summary`); they stay to show old archives still render without validation and to give `compare-runs.js` both shapes. A `<name>.capture.jsonl` beside a fixture is its redacted capture, and the merge must rebuild the fixture's `pages[]` from it. The repo is public, so a fixture keeps only its shape: hostnames become example domains, identifying page slugs generic ones, the site name `Example Site`, and free text placeholder text. The test fails on any hostname, IP address or `localhost` but an example domain; it can't catch a name.

## Git workflow

- **Main branch:** `trunk`
- **Branch prefixes:** `feature/`, `fix/`, `update/`, `add/`, `remove/`
- **Commit style:** conventional commits — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Merge strategy:** squash merge preferred for feature branches
- **PR requirements:** clear title, description of what changed and why
