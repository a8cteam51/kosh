const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { args } = require(path.join(ROOT, '.mcp.json')).mcpServers.playwright;

test('playwright mcp is pinned to an exact version', () => {
  assert.match(args[0], /^@playwright\/mcp@\d+\.\d+\.\d+$/, 'bump the pin in its own PR; @latest makes the version an unrecorded input to every run');
});

test('playwright mcp keeps no profile between sessions', () => {
  assert.ok(args.includes('--isolated'), 'without --isolated, every session reuses one on-disk profile: cache, cookies and logins carry over');
});

test('playwright mcp ignores tools a page registers', () => {
  assert.ok(args.includes('--no-webmcp'), 'without --no-webmcp, a tested page can add tools to the model\'s toolset');
});

test('playwright mcp loads the collectors into every page', () => {
  const script = args[args.indexOf('--init-script') + 1];
  assert.ok(args.includes('--init-script'), 'without --init-script, __kosh is undefined in every page');
  assert.ok(fs.existsSync(path.join(ROOT, script)), `${script} is missing, and Playwright MCP won't start without it`);
});

test('the plugin manifest uses .mcp.json', () => {
  assert.strictEqual(require(path.join(ROOT, '.claude-plugin/plugin.json')).mcpServers, './.mcp.json');
});

test('every browser tool a skill names is allowlisted', () => {
  const files = ['shared', 'skills'].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map((name) => path.join(ROOT, dir, name)));
  const named = files.filter((file) => file.endsWith('.md')).flatMap((file) => fs.readFileSync(file, 'utf8').match(/\bbrowser_[a-z_]+/g) || []);
  const allowed = require(path.join(ROOT, '.claude/settings.json')).permissions.allow;
  assert.ok(named.length > 0, 'no browser tools found in shared/ or skills/');
  assert.deepStrictEqual([...new Set(named)].filter((tool) => !allowed.includes(`mcp__playwright__${tool}`)), [], 'a tool missing from .claude/settings.json prompts mid-run');
});
