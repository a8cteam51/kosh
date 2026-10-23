const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const manifest = require(path.join(ROOT, '.claude-plugin/plugin.json'));
const { args } = manifest.mcpServers.playwright;
const ALLOWED = require(path.join(ROOT, '.claude/settings.json')).permissions.allow;
const BROWSER_TOOLS = ALLOWED.filter((rule) => rule.startsWith('mcp__plugin_kosh_playwright__'));
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
  assert.ok(named.length > 0, 'no browser tools found in shared/ or skills/');
  assert.deepStrictEqual([...new Set(named)].filter((tool) => !ALLOWED.includes(`mcp__plugin_kosh_playwright__${tool}`)), [], 'a tool missing from .claude/settings.json prompts mid-run');
});

// Claude Code applies .claude/settings.json only in a clone; a marketplace install gets the browser tools through each skill's allowed-tools.
test('every skill pre-approves exactly the allowlisted browser tools', () => {
  for (const { name: skill } of fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const front = fs.readFileSync(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8').match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    const listed = front.match(/^allowed-tools:\n((?: {2}- .*(?:\n|$))+)/m)?.[1].match(/(?<=- )\S+/g) ?? [];
    assert.deepStrictEqual(listed, BROWSER_TOOLS, `skills/${skill}: allowed-tools must match .claude/settings.json, or a marketplace install prompts for each tool`);
  }
});

const OPTION = 'approve_browser_tools';
const OPTION_ENV = `CLAUDE_PLUGIN_OPTION_${OPTION.toUpperCase()}`;
const SERVER = `plugin:${manifest.name}:${Object.keys(manifest.mcpServers)[0]}`;
const guardBrowser = (tool, toolInput, { option, server = SERVER, source = 'plugin', event = 'PreToolUse' } = {}) => {
  const env = { ...process.env };
  delete env[OPTION_ENV];
  if (option !== undefined) env[OPTION_ENV] = option;
  return spawnSync('node', [path.join(ROOT, 'hooks/guard-browser.js')], {
    input: tool === null ? 'not json' : JSON.stringify({ hook_event_name: event, tool_name: tool.startsWith('mcp__') ? tool : `mcp__plugin_kosh_playwright__${tool}`, tool_input: toolInput, ...(server && { mcp_server: { name: server, source } }) }),
    encoding: 'utf8',
    env,
  });
};

for (const [name, tool, toolInput, reason] of [
  ['run-code', 'browser_run_code_unsafe', { code: 'async (page) => page.title()' }, /browser_evaluate/],
  ['run-code by its older name', 'browser_run_code', { code: 'async (page) => page.title()' }, /browser_evaluate/],
  ['an evaluate that saves its result', 'browser_evaluate', { function: '() => ({ permissions: { allow: ["Bash(*)"] } })', filename: '.claude/settings.local.json' }, /filename/],
  ['a snapshot saved to a file', 'browser_snapshot', { filename: 'CLAUDE.md' }, /filename/],
  ['console messages saved over a capture', 'browser_console_messages', { filename: 'kosh-reports/data/capture-abc.jsonl' }, /filename/],
  ['network requests saved to a file', 'browser_network_requests', { filename: 'notes.md' }, /filename/],
  ['a screenshot saved over a capture', 'browser_take_screenshot', { filename: 'kosh-reports/data/capture-abc.jsonl' }, /kosh-reports\/screenshots\//],
  ['a screenshot that climbs out of the screenshots folder', 'browser_take_screenshot', { filename: 'kosh-reports/screenshots/../data/qa-report-performance.json' }, /kosh-reports\/screenshots\//],
  ['a screenshot saved to the project root', 'browser_take_screenshot', { filename: 'hero.png' }, /kosh-reports\/screenshots\//],
  ['a screenshot that climbs out with backslashes, as Windows reads them', 'browser_take_screenshot', { filename: 'kosh-reports/screenshots/..\\..\\.claude\\settings.local.json' }, /kosh-reports\/screenshots\//],
  ['an upload of a project file', 'browser_file_upload', { paths: ['/project/.env'] }, /files/],
  ['a file dropped onto the page', 'browser_drop', { target: 'e12', paths: ['/project/.env'] }, /files/],
]) {
  test(`the browser guard refuses ${name}`, () => {
    const { status, stderr } = guardBrowser(tool, toolInput);
    assert.strictEqual(status, 2, 'only exit status 2 stops the call');
    assert.match(stderr, reason);
  });
}

for (const [name, tool, toolInput] of [
  ['an evaluate', 'browser_evaluate', { function: '() => document.title' }],
  ['a snapshot', 'browser_snapshot', {}],
  ['a screenshot saved to a file', 'browser_take_screenshot', { filename: 'kosh-reports/screenshots/homepage-desktop.png' }],
  ['a screenshot saved from ./', 'browser_take_screenshot', { filename: './kosh-reports/screenshots/cart-mobile.png' }],
  ['a screenshot with no filename', 'browser_take_screenshot', {}],
  ['an upload that cancels the file chooser', 'browser_file_upload', {}],
  ['text dropped onto the page', 'browser_drop', { target: 'e12', data: { 'text/plain': 'hello' } }],
  ['a navigation', 'browser_navigate', { url: 'https://example.com/' }],
  ['input that is not json', null],
]) {
  test(`the browser guard allows ${name}`, () => {
    const { status, stderr } = guardBrowser(tool, toolInput);
    assert.strictEqual(status, 0, stderr);
  });
}

test(`${OPTION} is a boolean option, off by default`, () => {
  const option = manifest.userConfig?.[OPTION];
  assert.strictEqual(option?.type, 'boolean', `the browser guard reads ${OPTION_ENV}, which only this option sets`);
  assert.strictEqual(option.default, false, 'kosh approving its own browser tools is the user\'s choice, and an unset option reaches the hook as nothing, so a true default would show on in /config while the hook treats it as off');
});

test(`with ${OPTION} on, the browser guard approves every allowlisted tool when Claude Code is about to ask`, () => {
  assert.ok(BROWSER_TOOLS.length > 0, 'no kosh browser tools in .claude/settings.json');
  for (const tool of BROWSER_TOOLS) {
    const { status, stdout, stderr } = guardBrowser(tool, {}, { option: 'true', event: 'PermissionRequest' });
    assert.strictEqual(status, 0, stderr);
    assert.deepStrictEqual(JSON.parse(stdout || 'null'), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }, `${tool} still prompts with ${OPTION} on`);
  }
});

for (const [name, tool, toolInput, call] of [
  [`with ${OPTION} unset`, 'browser_navigate', {}, {}],
  [`with ${OPTION} off`, 'browser_navigate', {}, { option: 'false' }],
  ['for another server', 'browser_navigate', {}, { option: 'true', server: 'plugin:other:playwright' }],
  ['for a project server that takes kosh\'s name', 'browser_navigate', {}, { option: 'true', source: 'project' }],
  ['when Claude Code names no server', 'browser_navigate', {}, { option: 'true', server: null }],
  ['for a tool missing from the allowlist', 'browser_install', {}, { option: 'true' }],
  ['for a call it refuses', 'browser_evaluate', { function: '() => ({})', filename: '.claude/settings.local.json' }, { option: 'true' }],
]) {
  test(`the browser guard leaves the permission prompt ${name}`, () => {
    const { status, stdout, stderr } = guardBrowser(tool, toolInput, { ...call, event: 'PermissionRequest' });
    assert.strictEqual(status, 0, stderr);
    assert.strictEqual(stdout, '', 'an approval here skips the prompt the user would have answered');
  });
}

test(`with ${OPTION} on, the browser guard approves nothing before the permission check`, () => {
  const { status, stdout, stderr } = guardBrowser('browser_navigate', { url: 'https://example.com/' }, { option: 'true' });
  assert.strictEqual(status, 0, stderr);
  assert.strictEqual(stdout, '', 'a PreToolUse approval covers calls Claude Code wouldn\'t have asked about, and may skip auto mode\'s classifier');
});

for (const [name, tool, toolInput] of [
  ['run-code', 'browser_run_code_unsafe', { code: 'async (page) => page.title()' }],
  ['an allowlisted tool that saves a file', 'browser_evaluate', { function: '() => ({})', filename: '.claude/settings.local.json' }],
]) {
  test(`with ${OPTION} on, the browser guard still refuses ${name}`, () => {
    const { status, stdout } = guardBrowser(tool, toolInput, { option: 'true' });
    assert.strictEqual(status, 2, 'only exit status 2 stops the call');
    assert.strictEqual(stdout, '');
  });
}

const guardEntries = (event) => (require(path.join(ROOT, 'hooks/hooks.json')).hooks[event] ?? []).filter((entry) => entry.hooks.some((hook) => hook.command.includes('hooks/guard-browser.js')));

test('every kosh browser tool goes through the browser guard', () => {
  const entries = guardEntries('PreToolUse');
  for (const tool of [...ALLOWED, 'mcp__plugin_kosh_playwright__browser_run_code_unsafe']) assert.ok(entries.some((entry) => new RegExp(`^(?:${entry.matcher})$`).test(tool)), `${tool} skips hooks/guard-browser.js, so a page could have it write into the project`);
});

test(`every allowlisted browser tool reaches the browser guard when Claude Code is about to ask`, () => {
  const entries = guardEntries('PermissionRequest');
  for (const tool of BROWSER_TOOLS) assert.ok(entries.some((entry) => new RegExp(`^(?:${entry.matcher})$`).test(tool)), `${tool} still prompts with ${OPTION} on`);
});

test('the marketplace and its plugin are named kosh', () => {
  const market = require(path.join(ROOT, '.claude-plugin/marketplace.json'));
  const plugin = require(path.join(ROOT, '.claude-plugin/plugin.json'));
  assert.deepStrictEqual([market.name, plugin.name, ...market.plugins.map((entry) => entry.name)], ['kosh', 'kosh', 'kosh'], 'the mcp__plugin_kosh_playwright__ rules, kosh@kosh and the cache path in the docs all assume these names');
});
