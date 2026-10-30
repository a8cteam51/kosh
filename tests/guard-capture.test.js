const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HOOK = path.join(ROOT, 'hooks/guard-capture.js');

// KOSH and SPACED are folders kosh has run in, FRESH a clone no run has used yet, ELSEWHERE an unrelated project,
// OTHER one whose kosh-reports/data holds a log that only looks like a capture, NESTED a project inside KOSH.
const folder = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `kosh-guard-${name}-`));
const ranIn = (dir) => {
  fs.mkdirSync(path.join(dir, 'kosh-reports/data/archive'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kosh-reports/data/archive/EXAMPLE_SITE_PERFORMANCE_QA_REPORT_2026-10-13.capture.jsonl'), '{}\n');
  return dir;
};
const KOSH = ranIn(folder('kosh'));
const SPACED = ranIn(folder('Local Sites'));
const FRESH = folder('fresh');
const ELSEWHERE = folder('elsewhere');
const OTHER = folder('other');
const NESTED = path.join(KOSH, 'nested-project');
fs.mkdirSync(path.join(KOSH, 'scripts'));
fs.mkdirSync(NESTED);
fs.mkdirSync(path.join(FRESH, 'kosh-reports/data'), { recursive: true });
fs.mkdirSync(path.join(OTHER, 'kosh-reports/data'), { recursive: true });
fs.writeFileSync(path.join(OTHER, 'kosh-reports/data/screen-capture-log.jsonl'), '{}\n');
const PRE_RENAME = folder('pre-rename');
fs.mkdirSync(path.join(PRE_RENAME, 'reports/data'), { recursive: true });
fs.writeFileSync(path.join(PRE_RENAME, 'reports/data/capture-abc.jsonl'), '{}\n');
test.after(() => { for (const dir of [KOSH, SPACED, FRESH, ELSEWHERE, OTHER, PRE_RENAME]) fs.rmSync(dir, { recursive: true, force: true }); });
const SESSION = '0b3f6c2e-5d1a';

const RECASED = path.join(path.dirname(KOSH), path.basename(KOSH).toUpperCase());
const caseInsensitiveDisk = fs.existsSync(RECASED);

// `reports: null` runs the guard as installed, with KOSH_REPORTS_DIR unset; `project` is the root Claude Code gives hooks.
const guard = (input, { reports = KOSH, project, cwd = ROOT } = {}) => {
  const env = { ...process.env, KOSH_REPORTS_DIR: reports && path.join(reports, 'kosh-reports'), CLAUDE_PROJECT_DIR: project };
  if (!reports) delete env.KOSH_REPORTS_DIR;
  if (!project) delete env.CLAUDE_PROJECT_DIR;
  return spawnSync('node', [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', cwd, env });
};
const call = (tool_name, tool_input, cwd = KOSH) => ({ hook_event_name: 'PreToolUse', cwd, tool_name, tool_input });

for (const [name, input, options] of [
  ['writing a capture', call('Write', { file_path: path.join(KOSH, 'kosh-reports/data/capture-0b3f6c2e-5d1a.jsonl'), content: '{}' })],
  ['writing the no-session capture', call('Write', { file_path: 'kosh-reports/data/capture.jsonl', content: '{}' })],
  ["writing the link checker's record", call('Write', { file_path: path.join(KOSH, 'kosh-reports/data/links-0b3f6c2e-5d1a.jsonl'), content: '{}' })],
  ["editing the link checker's record", call('Edit', { file_path: 'kosh-reports/data/links.jsonl', old_string: '404', new_string: '200' })],
  ["appending a result to the link checker's record", call('Bash', { command: `echo '{"url":"https://x.example/","status":200}' >> kosh-reports/data/links-abc.jsonl` })],
  ["the link checker's record named by the session variable", call('Bash', { command: 'echo x >> "kosh-reports/data/links-${CLAUDE_CODE_SESSION_ID}.jsonl"' })],
  ['editing an archived capture', call('Edit', { file_path: 'kosh-reports/data/archive/EXAMPLE_SITE_PERFORMANCE_QA_REPORT_2026-10-13.capture.jsonl', old_string: 'a', new_string: 'b' })],
  ['multi-editing a capture', call('MultiEdit', { file_path: 'kosh-reports/data/capture-abc.jsonl', edits: [] })],
  ['appending to a capture from the shell', call('Bash', { command: `echo '{"type":"visit"}' >> kosh-reports/data/capture-abc.jsonl` })],
  ['a node one-liner that names a capture', call('Bash', { command: `node -e "require('fs').appendFileSync('kosh-reports/data/capture-abc.jsonl', 'x')"` })],
  ['deleting captures by glob', call('Bash', { command: 'rm kosh-reports/data/capture-*' })],
  ['deleting captures by a shorter glob', call('Bash', { command: 'rm kosh-reports/data/capture*' })],
  ['a capture named in upper case', call('Bash', { command: 'truncate -s 0 kosh-reports/data/CAPTURE-abc.JSONL' })],
  ['a capture named by the session variable', call('Bash', { command: 'echo x >> kosh-reports/data/capture-$CLAUDE_CODE_SESSION_ID.jsonl' })],
  ['a capture named by the braced session variable', call('Bash', { command: 'echo x >> "kosh-reports/data/capture-${CLAUDE_CODE_SESSION_ID}.jsonl"' })],
  ['a capture named with a quoted variable', call('Bash', { command: 'printf x | tee -a kosh-reports/data/capture-"$CLAUDE_CODE_SESSION_ID".jsonl' })],
  ['a capture named from inside kosh-reports/data', call('Bash', { command: 'echo x >> capture-abc.jsonl' }, path.join(KOSH, 'kosh-reports/data'))],
  ['deleting every jsonl in kosh-reports/data', call('Bash', { command: 'rm kosh-reports/data/*.jsonl' })],
  ['finding and deleting jsonl files', call('Bash', { command: "find kosh-reports -name '*.jsonl' -delete" })],
  ['deleting the archive folder', call('Bash', { command: 'rm -rf kosh-reports/data/archive' })],
  ['deleting kosh-reports/data', call('Bash', { command: 'rm -rf kosh-reports/data/' })],
  ['moving the archive folder away', call('Bash', { command: 'mv kosh-reports/data/archive /tmp/old-archive' })],
  ['deleting kosh reports by absolute path from another project', call('Bash', { command: `rm -rf ${path.join(KOSH, 'kosh-reports')}` }, ELSEWHERE)],
  ['cd into the kosh folder from another project', call('Bash', { command: `cd ${KOSH} && rm -rf kosh-reports/data/archive` }, ELSEWHERE)],
  ['naming the kosh folder in the wrong case from another project', call('Bash', { command: `cd ${RECASED} && rm -rf kosh-reports/data/archive` }, ELSEWHERE)],
  ['a relative capture path from the folder above', call('Bash', { command: `rm ${path.basename(KOSH)}/kosh-reports/data/capture-abc.jsonl` }, path.dirname(KOSH))],
  ["writing kosh's capture by absolute path from another project", call('Write', { file_path: path.join(KOSH, 'kosh-reports/data/capture-abc.jsonl'), content: '{}' }, ELSEWHERE)],
  ["appending to kosh's capture by absolute path from another project", call('Bash', { command: `echo x >> ${path.join(KOSH, 'kosh-reports/data/capture-abc.jsonl')}` }, ELSEWHERE)],
  ['a capture path in the wrong case', call('Write', { file_path: path.join(RECASED, 'KOSH-REPORTS/DATA/capture-abc.jsonl'), content: '{}' }, ELSEWHERE)],
  ['deleting the capture a failed archive left behind', call('Bash', { command: 'rm kosh-reports/data/capture-abc.jsonl.4242' }, ELSEWHERE)],
  ['planting a capture in a clone no run has used yet', call('Bash', { command: `echo '{"type":"visit"}' > kosh-reports/data/capture-abc.jsonl` }, FRESH), { reports: FRESH }],
  ['a capture in another checkout', call('Bash', { command: 'echo x >> /other-checkout/kosh-reports/data/capture-abc.jsonl' }, ELSEWHERE)],
  ['a capture under any kosh-reports/data, even in another project', call('Write', { file_path: path.join(ELSEWHERE, 'kosh-reports/data/capture.jsonl'), content: '{}' }, ELSEWHERE)],
  ['a call with no cwd, from the kosh folder', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm kosh-reports/data/*.jsonl' } }, { cwd: KOSH }],
  ['the installed guard, from the kosh folder', call('Bash', { command: 'rm -rf kosh-reports/data/archive' }, KOSH), { reports: null }],
  ["a subfolder of the session's project, when kosh has run there", call('Bash', { command: 'rm ../kosh-reports/data/*.jsonl' }, path.join(KOSH, 'scripts')), { reports: null, project: KOSH }],
  ["deleting a run folder's reports by absolute path, as installed", call('Bash', { command: `rm -rf ${path.join(KOSH, 'kosh-reports')}` }, ELSEWHERE), { reports: null }],
  ['cd into a run folder, as installed', call('Bash', { command: `cd ${KOSH} && rm -rf kosh-reports/data/archive` }, ELSEWHERE), { reports: null }],
  ["this session's capture by its variable, before the first run has made one", call('Bash', { command: 'cd kosh-reports/data && echo x > capture-$CLAUDE_CODE_SESSION_ID.jsonl' }, FRESH), { reports: null, project: FRESH }],
  ["this session's capture by the quoted braced variable, before the first run", call('Bash', { command: 'echo x > "capture-${CLAUDE_CODE_SESSION_ID}.jsonl"' }, FRESH), { reports: null, project: FRESH }],
  ["this session's capture by its id, before the first run", { ...call('Bash', { command: `cd kosh-reports/data && echo x > capture-${SESSION}.jsonl` }, FRESH), session_id: SESSION }, { reports: null, project: FRESH }],
  ["writing this session's capture by its id, anywhere", { ...call('Write', { file_path: path.join(ELSEWHERE, `capture-${SESSION}.jsonl`), content: '{}' }, ELSEWHERE), session_id: SESSION }, { reports: null }],
  ['a quoted run folder path with a space, from another project', call('Bash', { command: `rm -rf "${path.join(SPACED, 'kosh-reports')}"` }, ELSEWHERE), { reports: null }],
  ['an escaped run folder path with a space, from another project', call('Bash', { command: `rm -rf ${path.join(SPACED, 'kosh-reports').replace(/ /g, '\\ ')}` }, ELSEWHERE), { reports: null }],
  ['emptying the archive by glob', call('Bash', { command: 'rm -rf kosh-reports/data/archive/*' })],
  ['deleting archived reports by glob', call('Bash', { command: 'rm kosh-reports/data/archive/*.json' })],
  ['emptying kosh-reports/ by glob', call('Bash', { command: 'rm -rf kosh-reports/*' })],
  ["deleting one archived report's files by a trailing glob", call('Bash', { command: 'rm kosh-reports/data/archive/EXAMPLE_SITE_PERFORMANCE_QA_REPORT_2026-10-13.*' })],
  ['deleting archived reports by a name prefix', call('Bash', { command: 'rm kosh-reports/data/archive/EXAMPLE*' })],
  ['deleting archived reports by brace expansion', call('Bash', { command: 'rm kosh-reports/data/archive/{a,b}.json' })],
  ['deleting archived reports by a single-character glob', call('Bash', { command: 'rm kosh-reports/data/archive/report-?.json' })],
]) {
  test(`the guard blocks ${name}`, () => {
    const { status, stderr } = guard(input, options);
    assert.strictEqual(status, 2, stderr);
    assert.match(stderr, /written only by the browser/);
  });
}

test('the guard blocks a cwd in the wrong case', { skip: !caseInsensitiveDisk && 'the disk is case-sensitive' }, () => {
  const { status, stderr } = guard(call('Bash', { command: 'rm kosh-reports/data/*.jsonl' }, RECASED));
  assert.strictEqual(status, 2, stderr);
});

for (const [name, input, options] of [
  ['writing a report', call('Write', { file_path: 'kosh-reports/data/qa-report-performance.json', content: '{}' })],
  ['rendering a report', call('Bash', { command: 'scripts/run-qa-report.sh kosh-reports/data/qa-report-performance.json' })],
  ["running the link checker, which writes its record itself", call('Bash', { command: "node scripts/check-links.js 'https://x.example/' 'https://y.example/?a=1&b=2'" })],
  ['reading the inventory', call('Bash', { command: 'node scripts/page-capture.js inventory https://example.com/ https://example.com/links/' })],
  ['editing the capture collector', call('Edit', { file_path: 'collectors/capture.js', old_string: 'a', new_string: 'b' })],
  ['staging the capture code and tests', call('Bash', { command: 'git add collectors/capture.js tests/capture.test.js scripts/archive-capture.js' })],
  ['running the tests', call('Bash', { command: 'node --test "tests/*.test.js"' })],
  ['a write with content that mentions a capture', call('Write', { file_path: 'docs/notes.md', content: 'see kosh-reports/data/capture-abc.jsonl' })],
  ['deleting a leftover report', call('Bash', { command: 'rm kosh-reports/data/qa-report-shop.json' })],
  ['listing the archive', call('Bash', { command: 'ls kosh-reports/data/archive' })],
  ['removing a screenshot folder', call('Bash', { command: 'rm -rf kosh-reports/screenshots' })],
  ['a kosh-reports folder in another project', call('Bash', { command: 'rm -rf build/kosh-reports-old' })],
  ['a tool the guard does not cover', call('Read', { file_path: 'kosh-reports/data/capture-abc.jsonl' })],
  ['input that is not json', 'not json'],
  ['no input', ''],
  ['a jsonl glob in another project', call('Bash', { command: 'cat logs/*.jsonl' }, ELSEWHERE)],
  ['a capture-named log in another project', call('Write', { file_path: path.join(ELSEWHERE, 'logs/capture-1.jsonl'), content: '{}' }, ELSEWHERE)],
  ['a capture glob in another project', call('Bash', { command: 'cat logs/capture-*.jsonl' }, ELSEWHERE)],
  ["deleting another project's reports folder", call('Bash', { command: 'rm -rf kosh-reports/' }, ELSEWHERE)],
  ['the folder above the kosh folder', call('Bash', { command: 'rm -rf kosh-reports/data' }, path.dirname(KOSH))],
  ['a folder whose name only starts with the kosh folder', call('Bash', { command: 'rm -rf kosh-reports/data' }, `${KOSH}-old`)],
  ["a command naming a folder whose name only starts with the kosh folder's", call('Bash', { command: `rm -rf ${KOSH}-old/kosh-reports` }, ELSEWHERE)],
  ['the installed guard, from another project', call('Bash', { command: 'rm -rf kosh-reports/data/archive' }, ELSEWHERE), { reports: null }],
  ['deleting kosh-reports/data in a clone no run has used yet', call('Bash', { command: 'rm -rf kosh-reports/data' }, FRESH), { reports: FRESH }],
  ["the session's project, when kosh hasn't run there", call('Bash', { command: 'cat logs/*.jsonl' }, FRESH), { reports: null, project: FRESH }],
  ['a project inside a folder kosh has run in', call('Bash', { command: 'rm -rf kosh-reports/data' }, NESTED), { reports: null, project: NESTED }],
  ['a project inside a folder kosh has run in, without CLAUDE_PROJECT_DIR', call('Bash', { command: 'rm -rf kosh-reports/data' }, NESTED), { reports: null }],
  ["a log that only looks like a capture in another project's kosh-reports/data", call('Bash', { command: 'cat logs/*.jsonl' }, OTHER), { reports: null, project: OTHER }],
  ["another session's capture name, before the first run", { ...call('Bash', { command: 'cat capture-1111.jsonl' }, FRESH), session_id: SESSION }, { reports: null, project: FRESH }],
  ['emptying the screenshots folder by glob', call('Bash', { command: 'rm -rf kosh-reports/screenshots/*' })],
  ['deleting one named archived report', call('Bash', { command: 'rm kosh-reports/data/archive/EXAMPLE_SITE_PERFORMANCE_QA_REPORT_2026-10-13.json' })],
  ['deleting reports/ in a folder kosh has run in', call('Bash', { command: 'rm -rf reports/data' })],
  ['moving a pre-rename reports/ to kosh-reports/', call('Bash', { command: 'mv reports kosh-reports' }, PRE_RENAME), { reports: null, project: PRE_RENAME }],
  ['writing a capture in a pre-rename reports/', call('Write', { file_path: path.join(PRE_RENAME, 'reports/data/capture-abc.jsonl'), content: '{}' }, PRE_RENAME), { reports: null, project: PRE_RENAME }],
]) {
  test(`the guard allows ${name}`, () => {
    const { status, stderr } = guard(input, options);
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
