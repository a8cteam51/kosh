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
const sandbox = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-reports-dir-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'elsewhere');
  const reportsDir = path.join(root, 'reports');
  fs.mkdirSync(cwd);
  fs.mkdirSync(path.join(reportsDir, 'data'), { recursive: true });
  return { cwd, reportsDir };
};

const run = (script, args, { cwd, reportsDir }) => {
  const { status, stdout: raw, stderr } = spawnSync('bash', [path.join(SCRIPTS, script), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KOSH_REPORTS_DIR: reportsDir },
  });
  const stdout = raw.replace(/\x1b\[[0-9;]*m/g, '');
  assert.equal(status, 0, stderr + stdout);
  const html = stdout.match(/^Report location: (.+)$/m);
  assert.ok(html, `script did not report an HTML location:\n${stdout}`);
  assert.ok(html[1].startsWith(reportsDir + path.sep) && fs.existsSync(html[1]), `HTML not under KOSH_REPORTS_DIR: ${html[1]}`);
  assert.deepEqual(fs.readdirSync(cwd), [], 'script wrote into the cwd');
  return stdout;
};

test('run-qa-report.sh renders and archives under KOSH_REPORTS_DIR from any cwd', (t) => {
  const box = sandbox(t);
  const json = path.join(box.reportsDir, 'data', 'qa-report-functional.json');
  fs.writeFileSync(json, report('Reports Dir Fixture'));

  run('run-qa-report.sh', [json], box);

  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')), ['REPORTS_DIR_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

test('merge-qa-reports.sh finds its default inputs and the HTML under KOSH_REPORTS_DIR from any cwd', (t) => {
  const box = sandbox(t);
  for (const type of ['functional', 'performance', 'accessibility']) {
    fs.writeFileSync(path.join(box.reportsDir, 'data', `qa-report-${type}.json`), report('Merge Fixture'));
  }

  const stdout = run('merge-qa-reports.sh', [], box);

  assert.match(stdout, /Merge workflow complete/);
});
