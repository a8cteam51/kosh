const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '../scripts');

const report = (websiteName) => JSON.stringify({
  websiteName,
  url: 'https://example.com',
  timestamp: '2026-01-01T00:00:00Z',
  issues: { critical: [], high: [], medium: [], low: [] },
}, null, 2);

// Two sibling temp dirs: the script runs from one and must write only into the other.
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

// Runs the script itself, not `bash <script>`, so a lost executable bit fails here before it fails a skill.
const run = (script, args, { cwd, reportsDir }, env) => {
  const { status, stdout: raw, stderr, error } = spawnSync(script, args, { cwd, encoding: 'utf8', env });
  const stdout = (raw || '').replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(status, 0, error?.message ?? stderr + stdout);
  const html = stdout.match(/^Report location: (.+)$/m);
  assert.ok(html, `script did not report an HTML location:\n${stdout}`);
  assert.ok(html[1].startsWith(reportsDir + path.sep) && fs.existsSync(html[1]), `HTML not under ${reportsDir}: ${html[1]}`);
  assert.deepEqual(fs.readdirSync(cwd), [], 'script wrote into the cwd');
  return stdout;
};

test('run-qa-report.sh renders and archives under KOSH_REPORTS_DIR from any cwd', (t) => {
  const box = sandbox(t);
  const json = path.join(box.reportsDir, 'data', 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  run(path.join(SCRIPTS, 'run-qa-report.sh'), [json], box, { ...process.env, KOSH_REPORTS_DIR: box.reportsDir });

  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

// A copy of scripts/ next to a temp reports/ exercises the production default without touching the real directory.
test('without KOSH_REPORTS_DIR, the scripts use the reports/ next to their own directory', (t) => {
  const box = sandbox(t);
  fs.cpSync(SCRIPTS, path.join(box.root, 'scripts'), { recursive: true });
  // The input lives apart from the sandbox, so resolving reports/ from the input's location can't pass by accident.
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-reports-dir-input-'));
  t.after(() => fs.rmSync(inputDir, { recursive: true, force: true }));
  const json = path.join(inputDir, 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));
  const env = { ...process.env };
  delete env.KOSH_REPORTS_DIR;

  run(path.join(box.root, 'scripts', 'run-qa-report.sh'), [json], box, env);
});
