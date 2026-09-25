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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};

const run = (box, command, args) => {
  const { status, stdout, stderr, error } = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir } });
  assert.ifError(error);
  return { status, output: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, '') };
};

const archived = (box) => fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')).sort();
const archiveCopy = (box) => path.join(box.reportsDir, 'data', 'archive', 'WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json');
const SKILL_OUTPUT = 'reports/data/qa-report-functional.json';

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

// A skill saving a new report with Claude Code's Write tool has to read any file already at that path first.
test('the report a skill wrote is removed once its stamped copy is archived', (t) => {
  const box = sandbox(t);
  const json = write(box, SKILL_OUTPUT, stampable());

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.ok(!fs.existsSync(json), 'the source JSON is still there');
  assert.ok(JSON.parse(fs.readFileSync(archiveCopy(box), 'utf8')).provenance.seal, 'the archive copy is unstamped');
});

for (const [where, name] of [
  ['named as a keeper', 'reports/data/qa-report-functional.2026-09-23.original.json'],
  ['in a subfolder of reports/data', 'reports/data/old/qa-report-functional.json'],
  ['outside reports/data', 'qa-report-functional.json'],
]) {
  test(`a rendered report ${where} is archived and kept`, (t) => {
    const box = sandbox(t);
    const json = write(box, name, report());

    const { status, output } = run(box, WRAPPER, [json]);

    assert.equal(status, 0, output);
    assert.match(output, /Source data archived: /);
    assert.ok(fs.existsSync(json), 'the source JSON was removed');
  });
}

test('a report that could not be archived is kept', (t) => {
  const box = sandbox(t);
  const json = write(box, SKILL_OUTPUT, report());
  fs.writeFileSync(path.join(box.reportsDir, 'data', 'archive'), '');

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.match(output, /could not archive source JSON/);
  assert.ok(fs.existsSync(json), 'the only copy was removed');
});

// A shop name gets the report validated, and the bare fixture has no shop block, so it's refused like a real bad report.
test('a refused report a skill wrote is kept so it can be fixed', (t) => {
  const box = sandbox(t);
  const json = write(box, 'reports/data/qa-report-shop.json', report());

  const { status, output } = run(box, WRAPPER, [json]);

  assert.notEqual(status, 0, output);
  assert.match(output, /Nothing was rendered/);
  assert.ok(fs.existsSync(json), 'the refused report was removed before it could be fixed');
});

test('re-rendering an archive copy through the wrapper keeps its type and its one copy', (t) => {
  const box = sandbox(t);
  assert.equal(run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]).status, 0);

  const { status, output } = run(box, WRAPPER, [archiveCopy(box)]);

  assert.equal(status, 0, output);
  assert.match(output, /Test type: --functional/);
  assert.doesNotMatch(output, /could not archive/);
  assert.deepEqual(archived(box), ['WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
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
