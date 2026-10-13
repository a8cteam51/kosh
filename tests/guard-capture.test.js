const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HOOK = path.join(ROOT, 'hooks/guard-capture.js');

const guard = (input) => spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8' });
const call = (tool_name, tool_input) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input });

for (const [name, input] of [
  ['writing a capture', call('Write', { file_path: '/Users/x/kosh/reports/data/capture-0b3f6c2e-5d1a.jsonl', content: '{}' })],
  ['writing the no-session capture', call('Write', { file_path: 'reports/data/capture.jsonl', content: '{}' })],
  ['editing an archived capture', call('Edit', { file_path: 'reports/data/archive/EXAMPLE_SITE_PERFORMANCE_QA_REPORT_2026-10-13.capture.jsonl', old_string: 'a', new_string: 'b' })],
  ['multi-editing a capture', call('MultiEdit', { file_path: 'reports/data/capture-abc.jsonl', edits: [] })],
  ['appending to a capture from the shell', call('Bash', { command: `echo '{"type":"visit"}' >> reports/data/capture-abc.jsonl` })],
  ['a node one-liner that names a capture', call('Bash', { command: `node -e "require('fs').appendFileSync('reports/data/capture-abc.jsonl', 'x')"` })],
  ['deleting captures by glob', call('Bash', { command: 'rm reports/data/capture-*' })],
  ['deleting captures by a shorter glob', call('Bash', { command: 'rm reports/data/capture*' })],
  ['a capture named in upper case', call('Bash', { command: 'truncate -s 0 reports/data/CAPTURE-abc.JSONL' })],
  ['a capture named by the session variable', call('Bash', { command: 'echo x >> reports/data/capture-$CLAUDE_CODE_SESSION_ID.jsonl' })],
  ['a capture named by the braced session variable', call('Bash', { command: 'echo x >> "reports/data/capture-${CLAUDE_CODE_SESSION_ID}.jsonl"' })],
  ['a capture named with a quoted variable', call('Bash', { command: 'printf x | tee -a reports/data/capture-"$CLAUDE_CODE_SESSION_ID".jsonl' })],
  ['deleting every jsonl in reports/data', call('Bash', { command: 'rm reports/data/*.jsonl' })],
  ['finding and deleting jsonl files', call('Bash', { command: "find reports -name '*.jsonl' -delete" })],
  ['deleting the archive folder', call('Bash', { command: 'rm -rf reports/data/archive' })],
  ['deleting reports/data', call('Bash', { command: 'rm -rf reports/data/' })],
  ['deleting reports by its absolute path', call('Bash', { command: 'rm -rf /Users/x/kosh/reports' })],
  ['moving the archive folder away', call('Bash', { command: 'mv reports/data/archive /tmp/old-archive' })],
]) {
  test(`the guard blocks ${name}`, () => {
    const { status, stderr } = guard(input);
    assert.strictEqual(status, 2, stderr);
    assert.match(stderr, /written only by the browser/);
  });
}

for (const [name, input] of [
  ['writing a report', call('Write', { file_path: 'reports/data/qa-report-performance.json', content: '{}' })],
  ['rendering a report', call('Bash', { command: 'scripts/run-qa-report.sh reports/data/qa-report-performance.json' })],
  ['editing the capture collector', call('Edit', { file_path: 'collectors/capture.js', old_string: 'a', new_string: 'b' })],
  ['staging the capture code and tests', call('Bash', { command: 'git add collectors/capture.js tests/capture.test.js scripts/archive-capture.js' })],
  ['running the tests', call('Bash', { command: 'node --test "tests/*.test.js"' })],
  ['a write with content that mentions a capture', call('Write', { file_path: 'docs/notes.md', content: 'see reports/data/capture-abc.jsonl' })],
  ['deleting a leftover report', call('Bash', { command: 'rm reports/data/qa-report-shop.json' })],
  ['listing the archive', call('Bash', { command: 'ls reports/data/archive' })],
  ['removing a screenshot folder', call('Bash', { command: 'rm -rf reports/screenshots' })],
  ['a reports folder in another project', call('Bash', { command: 'rm -rf build/reports-old' })],
  ['a tool the guard does not cover', call('Read', { file_path: 'reports/data/capture-abc.jsonl' })],
  ['input that is not json', 'not json'],
  ['no input', ''],
]) {
  test(`the guard allows ${name}`, () => {
    const { status, stderr } = guard(input);
    assert.strictEqual(status, 0, stderr);
  });
}

test('the plugin runs the guard before every write and shell command', () => {
  const entries = require(path.join(ROOT, 'hooks/hooks.json')).hooks.PreToolUse;
  const guarded = entries.filter((entry) => entry.hooks.some((hook) => hook.command.includes('hooks/guard-capture.js')));
  assert.ok(fs.existsSync(HOOK));
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'Bash']) {
    assert.ok(guarded.some((entry) => new RegExp(`^(?:${entry.matcher})$`).test(tool)), `${tool} is not guarded`);
  }
});
