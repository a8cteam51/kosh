# kosh skill evals

Promptfoo regression checks for the skills' decision rules. Each case asks Claude Code, with a skill loaded, how it would handle a specific scenario, then asserts on the answer. Nothing here launches a browser: the prompt tells Claude this is a knowledge check about the skill's rules, not a test run.

These make real model calls and cost money. Run them by hand, not in CI.

## Run

```bash
cd evals
npm install
npm run eval                 # one pass
npm run eval -- --repeat 5   # repeat every case 5 times to measure stability
```

Requires Node 20.20+ or 22.22+ and a Claude Code login. The provider is the Claude Agent SDK, so no API key is needed.

Every case runs on two providers, `Opus 5` (`claude-opus-5`) and `Opus 5.5` (`claude-opus-5-5`), so a pass costs twice what one model does. Both pin `model` and `effort` in `promptfooconfig.yaml`. Without a model pin, the Claude Code CLI's default applies, which changes across versions and machines. Without an effort pin, the Agent SDK's default (`high`) applies, not your own `effortLevel`: the provider loads project settings only. Each case's `modelUsage` in the raw JSON records what actually served it.

The provider runs the Claude Code binary bundled in `@anthropic-ai/claude-agent-sdk`, not your installed `claude`, so it only knows the models that bundled version knows. A model newer than the pinned SDK fails with `Claude Code <version> does not support this model` until you bump the SDK (`npm install --save-dev @anthropic-ai/claude-agent-sdk@latest`, then commit the lockfile). The SDK's patch version tracks the bundled Claude Code's: SDK 0.3.280 ships Claude Code 2.1.280.

To run one model, filter by label. Anchor the pattern, because `Opus 5` also matches `Opus 5.5`:

```bash
npm run eval -- --filter-providers '^Opus 5$'
npm run eval -- --filter-providers '^Opus 5\.5$'
```

Each run:

1. Rebuilds `.workspaces/current/` from `skills/functional-design/` in the working tree, so the eval always tests your uncommitted edits.
2. Runs `promptfooconfig.yaml` with caching off.
3. Writes `results/functional-design.html` and `results/raw/functional-design.json`.
4. Exits with promptfoo's failure code (100) when any case fails or errors.

`.workspaces/`, `results/`, and `node_modules/` are gitignored.

## Add a case

Append to `tests:` in `promptfooconfig.yaml`. Keep each case to one rule and one scenario, and ask for the answer in a shape you can assert on: a leading keyword, a report excerpt, a yes/no.

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

To eval a different skill, change the skill name in `scripts/reset-workspace.mjs`, and in `promptfooconfig.yaml` the prompt, the `skills:` lists and the `skill-used` value.

## Design

Two layers, kept separate:

- **Snippet layer.** The fenced `javascript` blocks in the skills run against jsdom fixtures. Plain `node --test`, no model calls. Belongs in `tests/` at the repo root, not here.
- **Judgment layer.** This directory. Recorded probe output plus the skill's rules go in, and the assertion checks the status, severity, or recommendation that comes out. Each case loads the whole skill through the Skill tool, the way a real run does, so the evals see its structure and not just the section that matches a search: a rule buried, contradicted or moved during a rewrite shows up here. `Read`, `Grep`, `Glob` and `Bash` are disallowed because the skill file stays readable on disk, and a `skill-used` assertion on every case (`defaultTest`) fails any answer given without loading it.

Anchor assertions on report JSON fields where you can, since the schemas are the stable contract. Keep fixtures as plain files so they port to `claude plugin eval` mocks later. Do not build a `claude -p` replay runner here; end-to-end runs with recorded Playwright MCP mocks are what plugin eval provides.
