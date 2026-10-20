const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Inside Claude Code these point the stamp at the real session's transcript and effort.
delete process.env.CLAUDE_CODE_SESSION_ID;
delete process.env.CLAUDE_EFFORT;
process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'kosh-no-claude-config');

const SCRIPTS = path.join(__dirname, '../scripts');

const report = (websiteName) => JSON.stringify({
  websiteName,
  url: 'https://example.com',
  timestamp: '2026-01-01T00:00:00Z',
  issues: { critical: [], high: [], medium: [], low: [] },
}, null, 2);

// Two sibling temp dirs: with KOSH_REPORTS_DIR set, the script runs from one and must write only into the other.
// realpath because the scripts resolve symlinks (macOS's tmpdir is one) and the printed path must match.
const sandbox = (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-reports-dir-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'elsewhere');
  const reportsDir = path.join(root, 'reports');
  fs.mkdirSync(cwd);
  fs.mkdirSync(path.join(reportsDir, 'data'), { recursive: true });
  return { root, cwd, reportsDir };
};

// The environment of a Bash command in Claude Code: no KOSH_REPORTS_DIR, and no CLAUDE_PROJECT_DIR either.
const installed = () => {
  const env = { ...process.env };
  delete env.KOSH_REPORTS_DIR;
  delete env.CLAUDE_PROJECT_DIR;
  return env;
};

// Runs the script itself, not `bash <script>`, so a lost executable bit fails here before it fails a skill.
const run = (script, args, { cwd, reportsDir }, env) => {
  const before = fs.readdirSync(cwd);
  const { status, stdout: raw, stderr, error } = spawnSync(script, args, { cwd, encoding: 'utf8', env });
  const stdout = (raw || '').replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(status, 0, error?.message ?? stderr + stdout);
  const html = stdout.match(/^Report location: (.+)$/m);
  assert.ok(html, `script did not report an HTML location:\n${stdout}`);
  assert.ok(html[1].startsWith(reportsDir + path.sep) && fs.existsSync(html[1]), `HTML not under ${reportsDir}: ${html[1]}`);
  if (!reportsDir.startsWith(cwd + path.sep)) assert.deepEqual(fs.readdirSync(cwd), before, 'script wrote into the cwd');
  return stdout;
};

test('run-qa-report.sh renders and archives under KOSH_REPORTS_DIR from any cwd', (t) => {
  const box = sandbox(t);
  const json = path.join(box.reportsDir, 'data', 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  run(path.join(SCRIPTS, 'run-qa-report.sh'), [json], box, { ...process.env, KOSH_REPORTS_DIR: box.reportsDir });

  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

// A skill calls it as scripts/run-qa-report.sh from kosh's root, and a $0 like that isn't a path require() accepts.
test('run-qa-report.sh runs when called by the relative path the skills use', (t) => {
  const box = sandbox(t);
  const json = path.join(box.reportsDir, 'data', 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  const stdout = run('scripts/run-qa-report.sh', [json], { ...box, cwd: path.join(SCRIPTS, '..') }, { ...process.env, KOSH_REPORTS_DIR: box.reportsDir });

  assert.doesNotMatch(stdout, /Cannot find module/);
  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

// A copy of scripts/ beside its own empty reports/ shows the production default reads the project, never the folder next to the scripts.
test('without KOSH_REPORTS_DIR, the scripts create the cwd\'s reports/, ignored in git', (t) => {
  const box = sandbox(t);
  fs.cpSync(SCRIPTS, path.join(box.root, 'scripts'), { recursive: true });
  fs.cpSync(path.join(SCRIPTS, '../collectors'), path.join(box.root, 'collectors'), { recursive: true });
  // The project lives apart from the copy, so looking up from the cwd can't land on the folder next to the scripts.
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-reports-dir-project-')));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const project = { cwd, reportsDir: path.join(cwd, 'reports') };
  // The input lives apart from both, so resolving reports/ from the input's location can't pass by accident.
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-reports-dir-input-'));
  t.after(() => fs.rmSync(inputDir, { recursive: true, force: true }));
  const json = path.join(inputDir, 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  run(path.join(box.root, 'scripts', 'run-qa-report.sh'), [json], project, installed());

  assert.strictEqual(fs.readFileSync(path.join(project.reportsDir, '.gitignore'), 'utf8'), '*\n');
  assert.deepEqual(fs.readdirSync(path.join(project.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
  assert.deepEqual(fs.readdirSync(box.reportsDir, { recursive: true }), ['data'], 'wrote into the reports/ next to the scripts');
});

test('from a subfolder of the project, the scripts find the project\'s reports/', (t) => {
  const box = sandbox(t);
  const json = path.join(box.reportsDir, 'data', 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  run(path.join(SCRIPTS, 'run-qa-report.sh'), [json], { ...box, cwd: box.cwd }, installed());

  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});
