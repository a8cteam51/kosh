# kosh — Claude Code Plugin for WordPress QA

kosh is a Claude Code plugin that runs functional, performance, accessibility, shop, and AEO (answer-engine optimization) tests against live WordPress sites using Playwright MCP browser automation.

## Commands

No build step — the scripts are plain `node` and `bash`. The root `package.json` has one dependency, `ajv`, for report validation, and one devDependency, `jsdom`, for the collector tests; `evals/` has its own `package.json` for promptfoo. Install with `npm ci`, which never rewrites the committed lockfile — a rewritten one would block the user's next `git pull`. `npm install <pkg>` is only for adding a dependency.

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
node scripts/generate-report.js reports/data/archive/<name>.json  # renderer only: validates, skips the stamp and the archive
node scripts/page-capture.js summary https://example.com/ [<page>…]  # the rows a performance report's pages[] would get now, and pages with no recorded load
node scripts/compare-runs.js reports/data/archive/<name>.json…   # one block of rows per archived performance run, either shape
node --test "tests/*.test.js"                                     # script, collector, capture, hook, snippet, JSON-file, schema-drift, shared-block, portability, MCP-config, validation and fixture tests
```

`.github/workflows/ci.yml` runs `npm ci` and that same `node --test` line on every PR and on pushes to `trunk` — no API calls. The promptfoo evals stay manual because they cost money.

`generate-report.js` validates the report against its schema (`scripts/validate-report.js`, ajv) before rendering, so the check runs on every render path: `run-qa-report.sh` and a direct call. A report that doesn't match is refused — nothing is rendered or archived, and ajv's errors name each field, so the skill that wrote the JSON can fix it and re-run. `run-qa-report.sh` stamps provenance first, so a refused report comes back stamped with its own fields untouched. The types checked are the flagged ones plus any the content shows — `mode: "aeo"`, a `shop` block, or `pages[]` (performance; console and network data under `mobile`/`desktop` in runs from before it) — so leaving a flag out or passing the wrong one doesn't skip the check. A performance report that matches its schema is still refused while `visitedPages` lists a page with no row in `pages[]` (`uncovered()` in `scripts/page-capture.js`: its own URL or one that redirected to it, ignoring the fragment and `www.`), or while `pages[]` has rows but no `provenance.captureSha256`: the merge writes one with every `pages[]` it builds, so those rows came from the model, or from a report saved where the merge doesn't reach, and the refusal names the path it does. Only a schema file that declares `$schema` is validated — shop, aeo and performance today; functional and accessibility are still example documents and pass through with a note. Schemas must compile in ajv strict mode. `node scripts/generate-report.js <json> --skip-validation` renders without the check, which is how to re-render an archived report in an older shape; it's a renderer flag, not a `run-qa-report.sh` one, since the wrapper would also re-stamp and re-archive.

`run-qa-report.sh` stamps a `provenance` block into the source JSON before rendering: the skill writes `provenance.model` (self-reported), and `scripts/stamp-provenance.js` adds `pluginVersion`, a SHA-256 of each skill directory (references included), a SHA-256 of `collectors/` (it sits outside every skill folder), the Playwright MCP args from `.mcp.json` as `playwrightMcp`, and a `seal` over those plus the report's `timestamp` and, for a skill's own output with visits on its host, the `captureSha256` the merge wrote just before. `collectors` and `playwrightMcp` are read from disk when the report is rendered, not from the running browser, so a session started before a pull ran older code or flags than its block records. A block sealed before `collectors` and `playwrightMcp` existed keeps its seal. A valid seal means the block is never restamped, so re-rendering an archived run keeps the provenance of the run that produced it; a model-invented or copied-forward block fails the seal and is restamped. The seal is an unkeyed hash, so it guards against accidents, not deliberate tampering — anything with a shell can recompute it. A report with no `provenance` block at all is left untouched with a warning — it predates the feature, or the skill skipped `provenance.model`. The renderer prints the block as one footer line, and nothing for reports that predate it.

`run-qa-report.sh` also copies the source JSON to `reports/data/archive/` under the same basename as the HTML it generated, then deletes the source if it is a skill's own output, `qa-report-<type>.json` directly in the scripts' `reports/data/`, so the next run writes it as a new file. Claude Code's Write tool won't overwrite a file the session hasn't read, so a leftover report made the next run read it first, and one run copied a figure it never measured. A refused report, a failed copy, a renamed keeper and a report in any other folder stay, including one a skill wrote into a different `reports/` than the scripts'. Re-rendering an archive copy through the wrapper leaves it where it is. A same-day rerun with different content moves the previous run's copy aside with its timestamp appended, so the un-suffixed JSON is always the source of the current HTML.

Every page the browser loads is recorded by `collectors/capture.js` into `reports/data/capture-<session id>.jsonl`, or `capture.jsonl` when `CLAUDE_CODE_SESSION_ID` is unset or isn't only letters, digits and dashes. Each main-frame document is one `visit` line carrying the document's own status, or its failure. A redirect chain is one visit at its final URL; only its first step, the URL the run asked for, keeps its query, and only on the final URL's host; every other step keeps its origin and path, since a login step's query can carry a token. A visit commits only at the URL its navigation asked for, so a hash jump, a history update, a 204 or a download is none, and a `data:` or `about:blank` page ends the current visit. The visit is followed by its `load` timings and viewport, read from the page (Playwright reports no viewport when headed, which is how kosh runs), plus the `__kosh.gate()` answer on a coming-soon, password or private page. A timing read that lands on the next document, or on Chrome's error page for a failed visit, isn't recorded. Then come its `vitals` lines: LCP and CLS from the page's buffered performance entries (CLS as the worst burst of shifts under 1 s apart and 5 s long, input aside), read every half second until the visit ends or 10 s after load, with a line for each change and `settled: false` while an entry arrived in the last second. Reading until the visit ends is deliberate: a rule that stopped after a quiet second missed a shift at load + 2.6 s in real Chrome, and neither a full-page screenshot nor a resize creates shifts of its own. Then come its console errors and warnings, and its failed subresource requests (status 400 and up, or no response) as URL, status and type only, never headers, cookies or bodies. A popup can load before the capture attaches, so its first document's status, console and failed requests are read from the page's history, each once. Text is clipped, a visit stops at 200 rows and the file at 10 MB, each with a `truncated` line. When `run-qa-report.sh` removes a skill's own output, it also writes the taken capture to `archive/` beside the JSON as `<name>.capture.jsonl`, keeping only visits on the report's host or redirected from it (`www.` aside; `reportEntries()`, the rule the merge uses too), so a run that never rendered can't put another client's pages into this one's archive. A rendered skill report is therefore the end of a run: a re-render, a keeper or a report anywhere else leaves the capture alone, and a run that never renders leaves its entries to the next same-host run in that session. If the archive write fails, the capture stays under a renamed path the warning gives. For a skill's own output, `run-qa-report.sh` runs `scripts/page-capture.js merge` before the stamp. It takes the session's capture, moving it to `capture-<session id>.jsonl.taken` (or adding it to one a refused render left), so whatever the browser writes from then on starts the next run's file. With no capture for the session, it warns and names any other session's capture it left alone, since restarting Claude Code would strand one that holds this run. For a performance report, by flag or by content like validation, it then rewrites `pages[]` from the visits on the report's host, replacing anything the model wrote: one row per page and viewport, measured by its first visit (a revisit is counted, and adds only console and network rows), with page-world numbers that aren't finite dropped to null. A gate page is left out, because a coming-soon or password page is served at the site's own URL and the site is the page loaded after the login. A merge that fails stops the wrapper before anything renders. For every skill's own output it writes `provenance.captureSha256` over exactly the entries the archive will hold, or drops a copied one when there are none, and the archive overwrites rather than appends when the report carries one. A refused render leaves the taken file, and the retry adds what the browser wrote since; a rendered one archives it. Re-rendering an archived report never merges, so its `pages[]` and seal stay as they were. `node scripts/page-capture.js summary` prints the same rows mid-run, from the taken and live files, without taking anything. A PreToolUse hook (`hooks/guard-capture.js`) keeps a run from editing the capture into agreeing with its report, even when an allow rule covers the command; Read still works. Plugin hooks run in every session the plugin is enabled in, so the guard works in two tiers:
- **Everywhere:** Write, Edit and MultiEdit on a `capture*.jsonl` under a `reports/data/` (archive included) are refused, as is any Bash command that names one, in any case and any checkout. Another project with that exact layout is blocked too.
- **Only when a Bash command can reach the folder holding kosh's `reports/`**: its cwd is inside that folder, or it names the folder by its literal or real absolute path. Such a command is also refused for a bare capture name, a `*.jsonl` glob, or an `rm`/`mv` of `reports/`, `reports/data` or the archive. The guard finds that folder through `captureFile()` and compares real paths with the disk's own case. A `~`, `$HOME` or relative path from another folder isn't recognized.

Other projects' logs, globs and `reports/` folders are left alone, and clearing kosh's is done by hand. It's a pattern match, so it stops a shortcut, not someone set on getting around it; nothing local can tell a browser-written line from one a run wrote.

The renderer inlines each finding's screenshots as base64, because every run shares `reports/screenshots/` and a later run can overwrite a file an older report points at. Only image files inside `reports/` are read, and an inlined image expands in place through a CSS-only `<details>` toggle because a `data:` URI can't be a link target. A missing file keeps its external `src` with a warning; a remote, absolute, scheme-carrying or `../` path is dropped with a warning, so only paths inside `reports/` ever reach the HTML. The generator prints the inlined count and the HTML's size. The archived JSON still holds the shared-folder paths, so re-rendering an old run embeds whatever is at those paths now.

Both report templates carry a CSP meta tag (`script-src 'none'`, plus no objects, `<base>` or forms). The reports run no script, so text a tested site wrote can't run in a client's browser even if an escape is missed; Chrome enforces it on `file://`. `tests/generate-report.test.js` fails if either template loses it or gains a `<script>` or an inline handler.

`reports/` lives next to `scripts/`, and every script resolves it from its own location, never from the cwd; `tests/reports-dir.test.js` runs `run-qa-report.sh` from a foreign cwd to keep it that way. Skills are the exception: they write `reports/…` and call `scripts/*.sh` cwd-relative, which is why the documented launch is `cd kosh && claude --plugin-dir .`. `KOSH_REPORTS_DIR` redirects the scripts only — the tests use it to stay out of the real directory — and does not move where the skills write, so setting it for a real run leaves the renderer looking for screenshots the skill saved somewhere else. The SessionStart hook pre-creates the folders as a nicety; nothing depends on it.

With no flag, `run-qa-report.sh` takes the test type from the filename, and for AEO from `mode: "aeo"` in the JSON, so validation, the stamp and the renderer all get `--aeo` even when the skill forgets to pass it. A report with neither is rendered with a "not validated" note. An AEO-shaped report missing `mode` is a hard error in the renderer, not a fallback. A report has one type, so the stamp refuses more than one type flag or any other flag and leaves the report unsealed, and the renderer refuses the same plus any flag it doesn't know (`--skip-validation` aside).

`.mcp.json` runs Playwright MCP at an exact version with `--isolated`, `--no-webmcp`, `--init-script collectors/kosh.js` and `--init-page collectors/capture.js`, and `plugin.json` points at it, so a marketplace install gets the same flags. The `--init-script` and `--init-page` paths are relative to the folder Claude Code starts in: launched from anywhere else, the server fails to start and no skill has a browser (a plugin loaded from another folder shows `plugin:kosh:playwright` as failed), which a marketplace install will have to solve. `--isolated` keeps the browser profile in memory, so a session starts with no cache, cookies or logins from earlier sessions; runs within one session share them, and closing the browser (`browser_close` or the window) drops a gate login; `--no-webmcp` stops a tested page from registering tools the model could call; `--init-script` evaluates `collectors/kosh.js` in every page before the page's own scripts, defining a frozen `window.__kosh` that skills call through `browser_evaluate` (`() => __kosh.gate("https://…")`). The path is relative to the client's root, so it holds for `cd kosh && claude --plugin-dir .`, and a missing file stops Playwright MCP from starting. `--init-page` requires `collectors/capture.js` once and calls it with each tab's Playwright page, in Node inside the MCP server. There it has the server's file and shell access while handling text the tested site wrote, so it only ever serializes that text and registers no function a page can call. It never throws either: an init-page error breaks every browser tool, `navigate` included. An edit to it needs a server restart. `@latest` would make the Playwright version an unrecorded input to every run, so a bump is its own PR. `tests/mcp-config.test.js` holds all five, keeps the init-page inside `collectors/` so the provenance hash covers it, and checks that every `browser_*` tool a skill names is in `.claude/settings.json`'s allowlist, since a missing one prompts mid-run.

## How it works

Each test is a **skill** (`skills/`), invoked directly as `/kosh:<name>`. The skill parses the URL and environment type from user input, then carries the full testing procedure — what to check, how to check it, and how to report findings. Results follow the structure defined in a **schema** (`schemas/`) and are saved as JSON reports, which are then rendered to self-contained HTML reports via scripts in `scripts/`.

Skills and commands share one `/kosh:` namespace, so a command named after a skill makes that entry appear twice in the slash menu.

```
skills/          → detailed testing procedures (the actual prompts)
schemas/         → JSON schemas that define report structure
shared/          → canonical blocks every skill carries a verbatim copy of (never read at runtime)
collectors/      → code Playwright MCP loads: `kosh.js` into every page as `window.__kosh` (tested with jsdom), `capture.js` in Node for every tab (tested with a stub page)
scripts/         → report generation, validation, provenance, the page-capture merge, summary and archive, and the run comparison
hooks/           → session hooks (create reports/data/ on startup) and the PreToolUse capture guard
evals/           → promptfoo regression checks for skill decision rules (evals/README.md)
tests/           → `node --test` checks for the scripts, the collectors, the capture and its guard, skill-embedded snippets, shared-block copies, Claude Code-only constructs in skills, tracked JSON files, the Playwright MCP flags and allowlist, skill ↔ schema drift, report validation and redacted real reports (`tests/fixtures/`)
docs/            → user-facing guides (getting-started.md)
.github/         → the CI workflow (runs tests/ on every PR)
.mcp.json        → Playwright MCP server configuration (pinned, --isolated, --no-webmcp, --init-script, --init-page)
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

A skill is a prompt the model reads once and follows for the whole run. `skills/performance/SKILL.md` is the template the other four move to as they're rewritten; until then they keep their older style. A rewritten skill:

- Follows this outline, in prose with the reason for each rule, because a model given the why handles the case the rule didn't name: the shared preamble; a two-sentence role saying what a finding is; the environment table; the shared gate check; the pages to cover and the floor, stated once; what to test, phase by phase, with what counts and what doesn't; the severity guide with its reasons and two or three "not a finding / a finding" lines; the report section. No `MANDATORY` blocks, `- ✅` rule lists, `- [ ]` checklists or closing reminders: the schema, which refuses a report that doesn't match, and the rendered tables are the gate.
- Leaves measuring to code. Numbers come from the collectors and the page capture, and the model reads them (the performance skill through `scripts/page-capture.js summary`) rather than transcribing them: a number the model copies is a number it can get wrong. The model's report holds its judgment: findings with a cause, `testMethodology`, and `explorationPass` for anything beyond the checks.
- Points at its schema as the contract and shows one labelled illustrative example, with placeholders where a copied value would do harm (the timestamp, the model ID). `tests/schema-drift.test.js` validates the example.
- Carries the blocks in `shared/` as verbatim copies, because skills can't include files and a skill folder must hold everything it runs: every skill carries the preamble, the gate check and the `provenance.model` line, and the skills in `CARRIERS` in `tests/shared-blocks.test.js` carry the others (the screenshot rule, performance only so far). Edit the `shared/` file and every copy together; the test fails otherwise.
- Don't add Claude Code-only constructs (host tool names like `PushNotification`, `/kosh:` references, `mcp__` tool names, `CLAUDE_…` variables, `$ARGUMENTS`, "Claude prompt"): other hosts load skill text verbatim. `tests/portability.test.js` holds today's count per file, counting each `shared/` block once in `shared/` rather than in every copy; lower a count when a rewrite removes one, never raise it.
- Put page-side code in `collectors/kosh.js` and call it from the skill in one line (`() => __kosh.<name>(…)`), not as a multi-line `javascript` block. `tests/skill-snippets.test.js` holds today's count of multi-line blocks per file; lower it when a block moves out, never raise it.
- Test your changes by running the skill against a real site and reviewing the report. For `functional-design`, also run the promptfoo evals — see `evals/README.md`.

### Adding or editing a schema

Schemas define the structure of the JSON reports. If you change what a skill collects, update the matching schema. The report generation scripts (`scripts/generate-report.js`) depend on this structure.

In the performance schema, URLs kosh navigated to (`url`, `visitedPages`, `pages[].url`, a finding's `pages`) use its `webUrl` definition, http(s) only; shop and aeo adopt it when they're rewritten. URLs read off the site, like a failed request's, stay plain strings: a malformed one is something to report, and a schema that refused it would push the skill to "fix" the site's data in the JSON.

`tests/fixtures/` holds real reports that must keep passing their schema (`tests/fixtures.test.js`), so a schema edit that would refuse a real run fails CI. A fixture kept to show a refusal pins its exact errors in that test's `EXPECTED_ERRORS` instead, as the three performance runs from before `pages[]` do for their shape (and `performance-opus-5-run-1.json` for its invented `summary`); they stay to show old archives still render with `--skip-validation` and to give `compare-runs.js` both shapes. A `<name>.capture.jsonl` beside a fixture is its redacted capture, and the merge must rebuild the fixture's `pages[]` from it. The repo is public, so a fixture keeps only its shape: hostnames become example domains, identifying page slugs generic ones, the site name `Example Site`, and free text placeholder text. The test fails on any hostname, IP address or `localhost` but an example domain; it can't catch a name.

## Git workflow

- **Main branch:** `trunk`
- **Branch prefixes:** `feature/`, `fix/`, `update/`, `add/`, `remove/`
- **Commit style:** conventional commits — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Merge strategy:** squash merge preferred for feature branches
- **PR requirements:** clear title, description of what changed and why
