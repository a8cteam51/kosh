const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const EVALS = path.join(__dirname, '..', 'evals');
const config = fs.readFileSync(path.join(EVALS, 'promptfooconfig.yaml'), 'utf8');
const skills = fs.readdirSync(path.join(EVALS, 'tests')).filter((name) => name.endsWith('.yaml')).map((name) => path.basename(name, '.yaml'));

// Read line by line: the YAML parser lives in evals/node_modules, which CI doesn't install.
const labels = [...config.matchAll(/^  - label: (\S+)$/gm)].map((match) => match[1]);
const scenarios = [...config.matchAll(/^  - file:\/\/tests\/(\S+)\.yaml$/gm)].map((match) => match[1]);
const anchored = config.match(/^      skills: &(\S+) \[(.*)\]$/m);
const enabled = anchored ? anchored[2].split(',').map((name) => name.trim().replace(/^'|'$/g, '')) : [];

test('every eval scenario file is listed in the config', () => {
  assert.deepStrictEqual([...scenarios].sort(), [...skills].sort(), 'a tests/<skill>.yaml missing from scenarios: never runs, and one listed without a file fails to load');
});

test('every provider enables the same skills', () => {
  const providers = config.match(/^  - id: anthropic:claude-agent-sdk$/gm) || [];
  const lists = config.match(/^      skills: .*$/gm) || [];
  assert.ok(anchored, 'the first provider\'s skills: list must carry the anchor the others reuse');
  assert.strictEqual(lists.length, providers.length, 'a provider without skills: falls back to the CLI\'s own skill defaults');
  assert.deepStrictEqual(lists.slice(1), lists.slice(1).map(() => `      skills: *${anchored[1]}`), 'a provider with its own skills: list can drift from the others');
});

for (const skill of skills) {
  const scenario = fs.readFileSync(path.join(EVALS, 'tests', `${skill}.yaml`), 'utf8');

  test(`${skill} evals run with their own prompt`, () => {
    assert.match(scenario, new RegExp(`^  - prompts: \\[${skill}\\]$`, 'm'), `tests/${skill}.yaml's config must select the prompt labelled ${skill}`);
    assert.ok(labels.includes(skill), `promptfooconfig.yaml has no prompt labelled ${skill}: promptfoo drops the scenario's cases and still exits 0`);
  });

  test(`${skill} evals require ${skill} to load`, () => {
    assert.match(scenario, new RegExp(`^      - type: skill-used\\n        value: ${skill}$`, 'm'), `tests/${skill}.yaml's config must assert skill-used: ${skill}, or an answer given without the skill passes`);
    assert.ok(enabled.includes(skill), `the providers' skills: list doesn't enable ${skill}, so the Skill tool refuses it`);
  });
}
