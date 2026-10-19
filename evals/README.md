# kosh skill evals

Promptfoo regression checks for the skills' decision rules. `promptfooconfig.yaml` runs every skill's cases in one pass, into one report; each skill's cases live in `tests/<skill>.yaml`. Each case asks Claude Code, with a skill loaded, how it would handle a specific scenario, then asserts on the answer. Nothing here launches a browser: the prompt tells Claude this is a knowledge check about the skill's rules, not a test run.

These make real model calls and cost money. Run them by hand, not in CI.

## Run

```bash
cd evals
npm ci
npm run eval                                       # one pass of every skill's cases
npm run eval -- --repeat 5                         # repeat every case 5 times to measure stability
npm run eval -- --filter-prompts performance       # one skill's cases only
npm run eval -- --filter-providers '^Opus 5$'      # one model only; anchor it, since 'Opus 5' also matches 'Opus 5.5'
```

Requires Node 22.22+ and a Claude Code login. The provider is the Claude Agent SDK, so no API key is needed.

Every case runs on two providers, `Opus 5` (`claude-opus-5`) and `Opus 5.5` (`claude-opus-5-5`), so a pass costs twice what one model does. Both pin `model` and `effort` in `promptfooconfig.yaml`. Without a model pin, the Claude Code CLI's default applies, which changes across versions and machines. Without an effort pin, the Agent SDK's default (`high`) applies, not the `effortLevel` in your own Claude Code settings, because `setting_sources: ['project']` loads project settings only (promptfoo's own default loads none). Each case's `modelUsage` in the raw JSON records what actually served it, next to a Haiku entry for Claude Code's own background calls.

The providers share one `skills:` list, which decides which skills the model can see: every skill that has evals. So each case sees the other evaluated skills too, and `skill-used` fails a case that doesn't load its own.

The provider runs the Claude Code binary bundled in `@anthropic-ai/claude-agent-sdk`, not your installed `claude`, so it only knows the models that bundled version knows. A model newer than the bundled Claude Code fails with `Claude Code <version> does not support this model` until you bump the SDK.

`package.json` pins the SDK exactly, since a range lets any `npm install` move it, and the Claude Code under every eval with it; `tests/evals-config.test.js` checks the pin. promptfoo pins its own SDK version too, but the provider runs the top-level copy, so a promptfoo bump leaves ours alone and installs promptfoo's version nested and unused (about 230 MB). To bump, prefer the version the installed promptfoo pins (`npm view promptfoo@<version> optionalDependencies`): its provider was built against it, and there is then one copy. Run `npm install --save-dev --save-exact @anthropic-ai/claude-agent-sdk@<version>` and commit the lockfile; `npm view @anthropic-ai/claude-agent-sdk@<version> claudeCodeVersion` shows the Claude Code it bundles.

Each run:

1. Rebuilds `.workspaces/current/` from `skills/` in the working tree, so the eval always tests your uncommitted edits.
2. Runs `promptfooconfig.yaml` with caching off.
3. Writes `results/evals.html` and `results/raw/evals.json`.
4. Exits with promptfoo's failure code (100) when any case fails or errors.

`.workspaces/`, `results/`, and `node_modules/` are gitignored.

## When to run

When something the evals depend on changes, not on a schedule. Between changes the inputs are pinned: the skill text is in the repo, the model and effort are in `promptfooconfig.yaml`, and promptfoo, the Agent SDK and its bundled Claude Code are in `package-lock.json`. A repeat run mostly re-measures sampling noise, at about $4 for a cold run of both skills on both models (functional-design about $2.50, performance about $1.70); a run soon after another reuses the prompt cache and costs less.

- A skill with evals changes: before the PR merges, and before and after a rewrite.
- The cases or `promptfooconfig.yaml` change.
- A new model, or a bump of promptfoo, the Agent SDK or Claude Code.
- A baseline or refactor phase starts, so there is a "before" to compare against.

When a case set is new or changed, run it once with `--repeat 3` (or 5) to find the unstable cases. A stable case then only needs re-running on one of the triggers above.

## Add a case

Append to `tests:` in `tests/<skill>.yaml`. Keep each case to one rule and one scenario, and ask for the answer in a shape you can assert on: a leading keyword, a report excerpt, a yes/no.

Give the scenario every fact a real run would have: the page URL (on `example.com`), screenshot paths, the script output. A missing fact gets invented, and invented values differ between runs and models. Leave the judgments the case isn't testing, such as severity, to the model; they aren't asserted, and pinning them tests less of the skill.

```yaml
  - description: What the rule is and what the case pins
    vars:
      request: |
        The scenario, with the exact data the skill would have seen.
        End by saying what shape the answer should take.
    assert:
      - type: contains
        value: 'text that must appear'
      - type: not-contains
        value: 'text that must not appear'
```

Useful assertion types: `contains`, `not-contains`, `icontains`, `regex`. See the [promptfoo assertion reference](https://www.promptfoo.dev/docs/configuration/expected-outputs/) for the rest.

Performance cases ask for the report's `issues` and `explorationPass` as one fenced JSON block, and the transform in `tests/performance.yaml`'s `config` parses it, so each case asserts with `javascript` on the parsed report, e.g. `output.issues.low.length > 0`.

To eval another skill, add a prompt labelled with its name to `promptfooconfig.yaml`, add it to the `skills:` list (the second provider reuses it), and add `tests/<skill>.yaml` to `scenarios:`. Copy an existing file: its `config` names the prompt the cases use, the skill they must load, and the skill's defaults, which can't go in `defaultTest` because that applies to every skill's cases. `tests/evals-config.test.js` at the repo root checks that wiring, since promptfoo drops a scenario whose prompt label matches nothing and still exits 0.

## Design

Two layers, kept separate:

- **Snippet layer.** The fenced `javascript` blocks in the skills run against jsdom fixtures. Plain `node --test`, no model calls. Belongs in `tests/` at the repo root, not here.
- **Judgment layer.** This directory. Recorded probe output plus the skill's rules go in, and the assertion checks the status, severity, or recommendation that comes out. Each case loads the whole skill through the Skill tool, the way a real run does, so the evals see its structure and not just the section that matches a search: a rule buried, contradicted or moved during a rewrite shows up here. `Read`, `Grep`, `Glob` and `Bash` are disallowed because the skill file stays readable on disk, and a `skill-used` assertion on every case (in each `tests/<skill>.yaml`'s `config`) fails any answer given without loading it.

Anchor assertions on report JSON fields where you can, since the schemas are the stable contract. Keep fixtures as plain files so they port to `claude plugin eval` mocks later. Do not build a `claude -p` replay runner here; end-to-end runs with recorded Playwright MCP mocks are what plugin eval provides.
