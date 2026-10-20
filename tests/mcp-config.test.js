const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { args } = require(path.join(ROOT, '.claude-plugin/plugin.json')).mcpServers.playwright;
const fromRoot = (arg) => arg.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, '');

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
  assert.match(script, /^\$\{CLAUDE_PLUGIN_ROOT\}\//, 'a relative path resolves against the folder Claude Code starts in, and the server fails to start anywhere else');
  assert.ok(fs.existsSync(path.join(ROOT, fromRoot(script))), `${script} is missing, and Playwright MCP won't start without it`);
});

test('playwright mcp records every page through the capture', () => {
  const file = args[args.indexOf('--init-page') + 1];
  assert.ok(args.includes('--init-page'), 'without --init-page, nothing records page loads, console errors or failed requests');
  assert.match(file, /^\$\{CLAUDE_PLUGIN_ROOT\}\//, 'a relative path resolves against the folder Claude Code starts in, and the server fails to start anywhere else');
  assert.ok(fs.existsSync(path.join(ROOT, fromRoot(file))), `${file} is missing, and Playwright MCP won't start without it`);
  assert.match(fromRoot(file), /^collectors\//, 'outside collectors/, the provenance collectors hash would not cover the capture');
});

test('playwright mcp keeps its own files out of the project', () => {
  assert.match(args[args.indexOf('--output-dir') + 1] ?? '', /^\$\{CLAUDE_PLUGIN_DATA\}\//, 'by default page snapshots and console logs go to .playwright-mcp/ in the project, where git add picks up client pages');
  assert.ok(Number(args[args.indexOf('--output-max-size') + 1]) > 0, 'without a cap, every project\'s page text and console output piles up in the data folder, which survives updates');
});

test('the plugin declares the only playwright server', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, '.mcp.json')), 'in a clone, a project .mcp.json starts a second browser beside the plugin\'s, and a run can split its pages between them');
});

test('every browser tool a skill names is allowlisted', () => {
  const files = ['shared', 'skills'].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map((name) => path.join(ROOT, dir, name)));
  const named = files.filter((file) => file.endsWith('.md')).flatMap((file) => fs.readFileSync(file, 'utf8').match(/\bbrowser_[a-z_]+/g) || []);
  const allowed = require(path.join(ROOT, '.claude/settings.json')).permissions.allow;
  assert.ok(named.length > 0, 'no browser tools found in shared/ or skills/');
  assert.deepStrictEqual([...new Set(named)].filter((tool) => !allowed.includes(`mcp__plugin_kosh_playwright__${tool}`)), [], 'a tool missing from .claude/settings.json prompts mid-run');
});
