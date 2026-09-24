const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WRAPPER = path.join(__dirname, '../scripts/run-qa-report.sh');
const RENDERER = path.join(__dirname, '../scripts/generate-report.js');

const report = (edit = () => {}) => {
  const r = {
    url: 'https://example.com/',
    websiteName: 'Wrapper Fixture',
    timestamp: '2026-01-01T00:00:00Z',
    issues: { critical: [], high: [], medium: [], low: [] },
  };
  edit(r);
  return r;
};

// The prefix lets a test put characters like ' into every path the scripts see, reports/ included.
const sandbox = (t, prefix = 'kosh-run-') => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, reportsDir: path.join(root, 'reports') };
};

const write = (box, name, value) => {
  const file = path.join(box.root, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};

const run = (box, command, args) => {
  const { status, stdout, stderr, error } = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir } });
  assert.ifError(error);
  return { status, output: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, '') };
};

const archived = (box) => fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')).sort();

test('a report missing a severity list is counted as empty and still archived', (t) => {
  const box = sandbox(t);
  const json = write(box, 'qa-report-functional.json', report((r) => { delete r.issues.high; }));

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.match(output, /High Priority Issues: 0/);
  assert.deepEqual(archived(box), ['WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

// The rerun moves the first archived copy aside, which reads that copy by its path.
test("a ' in the report and reports/ paths is read as part of the path", (t) => {
  const box = sandbox(t, "kosh-run-it's-");
  const json = write(box, "site's-report.json", report());

  const first = run(box, WRAPPER, [json]);
  assert.equal(first.status, 0, first.output);

  write(box, "site's-report.json", report((r) => { r.timestamp = '2026-01-01T09:00:00Z'; }));
  const rerun = run(box, WRAPPER, [json]);

  assert.equal(rerun.status, 0, rerun.output);
  assert.deepEqual(archived(box), ['WRAPPER_FIXTURE_QA_REPORT_2026-01-01.json', 'WRAPPER_FIXTURE_QA_REPORT_2026-01-01_2026-01-01T00-00-00Z.json']);
});

// A failed read looks like "no mode", so only an aeo report shows whether the path was read.
test("a ' in the path doesn't hide an aeo report's mode", (t) => {
  const box = sandbox(t, "kosh-run-it's-");
  const json = write(box, "site's-report.json", report((r) => { r.mode = 'aeo'; }));

  assert.match(run(box, WRAPPER, [json]).output, /Test type: --aeo/);
});

const stampable = () => report((r) => { r.provenance = { model: 'claude-test-1' }; });

// The quoted pair reaches the stamp and the renderer as two flags, because the wrapper word-splits its flags.
for (const flags of [['--functional', '--performance'], ['--functional --performance'], ['--functional', '--a11y']]) {
  test(`the wrapper refuses ${JSON.stringify(flags)} without stamping or rendering anything`, (t) => {
    const box = sandbox(t);
    const json = write(box, 'qa-report-functional.json', stampable());
    const before = fs.readFileSync(json, 'utf8');

    const { status, output } = run(box, WRAPPER, [json, ...flags]);

    assert.notEqual(status, 0, output);
    assert.equal(fs.readFileSync(json, 'utf8'), before, 'the report was stamped');
    assert.ok(!fs.existsSync(box.reportsDir), 'something was written under reports/');
  });
}

test('the wrapper renders a repeated type flag as that one type', (t) => {
  const box = sandbox(t);
  const json = write(box, 'qa-report-functional.json', stampable());

  const { status, output } = run(box, WRAPPER, [json, '--functional', '--functional']);

  assert.equal(status, 0, output);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(json, 'utf8')).provenance.skills), ['functional-design']);
});

for (const [flags, message] of [
  [['--functional', '--performance'], /one test type flag/],
  [['--shop', '--aeo'], /one test type flag/],
  [['--a11y'], /unknown flag --a11y/],
  [['--functional --performance'], /unknown flag --functional --performance/],
]) {
  test(`the renderer refuses ${JSON.stringify(flags)}`, (t) => {
    const box = sandbox(t);
    const json = write(box, 'report.json', report());

    const { status, output } = run(box, 'node', [RENDERER, json, ...flags]);

    assert.notEqual(status, 0, output);
    assert.match(output, message);
    assert.ok(!fs.existsSync(box.reportsDir), 'something was written under reports/');
  });
}
