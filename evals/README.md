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

The model is pinned under `providers[0].config.model` in `promptfooconfig.yaml`. Without a pin, the Claude Code CLI's default applies, which changes across versions and machines. Each case's `modelUsage` in the raw JSON records what actually served it.

Each run:

1. Rebuilds `.workspaces/current/` from `skills/functional-design/` in the working tree, so the eval always tests your uncommitted edits.
2. Runs `promptfooconfig.yaml` with caching off.
3. Writes `results/functional-design.html` and `results/raw/functional-design.json`.
4. Exits with promptfoo's failure code (100) when any case fails or errors.

`.workspaces/`, `results/`, and `node_modules/` are gitignored.

## Add a case

Append to `tests:` in `promptfooconfig.yaml`. Keep each case to one rule and one scenario, and ask for the answer in a shape you can assert on: a leading keyword, a report excerpt, a yes/no.

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

To eval a different skill, change the skill name in `scripts/reset-workspace.mjs` and the `skills:` list in `promptfooconfig.yaml`.

## Design

Two layers, kept separate:

- **Snippet layer.** The fenced `javascript` blocks in the skills run against jsdom fixtures. Plain `node --test`, no model calls. Belongs in `tests/` at the repo root, not here.
- **Judgment layer.** This directory. Recorded probe output plus the skill's rules go in, and the assertion checks the status, severity, or recommendation that comes out.

Anchor assertions on report JSON fields where you can, since the schemas are the stable contract. Keep fixtures as plain files so they port to `claude plugin eval` mocks later. Do not build a `claude -p` replay runner here; end-to-end runs with recorded Playwright MCP mocks are what plugin eval provides.
