const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildPages } = require('../scripts/page-capture.js');

// Inside Claude Code these point the stamp at the real session's transcript and effort.
delete process.env.CLAUDE_CODE_SESSION_ID;
delete process.env.CLAUDE_EFFORT;
process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'kosh-no-claude-config');

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

// The prefix lets a test put characters like ' into every path the scripts see, kosh-reports/ included.
const sandbox = (t, prefix = 'kosh-run-') => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, reportsDir: path.join(root, 'kosh-reports') };
};

const write = (box, name, value) => {
  const file = path.join(box.root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};

const SESSION = 'wrapper-test';

const run = (box, command, args, env = {}) => {
  const { status, stdout, stderr, error } = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir, CLAUDE_CODE_SESSION_ID: SESSION, ...env } });
  assert.ifError(error);
  return { status, output: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, '') };
};

const archived = (box) => fs.readdirSync(path.join(box.reportsDir, 'data', 'archive')).sort();
const archiveCopy = (box) => path.join(box.reportsDir, 'data', 'archive', 'WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json');
const SKILL_OUTPUT = 'kosh-reports/data/qa-report-functional.json';

test('a report missing a severity list is counted as empty and still archived', (t) => {
  const box = sandbox(t);
  const json = write(box, 'qa-report-functional.json', report((r) => { delete r.issues.high; }));

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.match(output, /High Priority Issues: 0/);
  assert.deepEqual(archived(box), ['WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

// The rerun moves the first archived copy aside, which reads that copy by its path.
test("a ' in the report and kosh-reports/ paths is read as part of the path", (t) => {
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

test("only a skill's own output takes the session's model and effort; a re-render keeps its self-report", (t) => {
  const box = sandbox(t);
  const project = path.join(box.root, 'claude', 'projects', '-kosh');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, `${SESSION}.jsonl`), JSON.stringify({ type: 'assistant', message: { model: 'claude-served' }, requestedModel: 'claude-served[1m]', effort: 'xhigh' }));
  const env = { CLAUDE_CONFIG_DIR: path.join(box.root, 'claude'), CLAUDE_EFFORT: 'medium' };
  const provenance = () => JSON.parse(fs.readFileSync(archiveCopy(box), 'utf8')).provenance;

  const own = run(box, WRAPPER, [write(box, SKILL_OUTPUT, stampable())], env);
  assert.equal(own.status, 0, own.output);
  assert.deepEqual([provenance().model, provenance().modelSource, provenance().effort], ['claude-served[1m]', 'transcript', 'xhigh']);

  const archived = JSON.parse(fs.readFileSync(archiveCopy(box), 'utf8'));
  archived.provenance = { model: 'claude-test-1', seal: 'b'.repeat(64) };
  fs.writeFileSync(archiveCopy(box), JSON.stringify(archived));
  const rerender = run(box, WRAPPER, [archiveCopy(box)], env);
  assert.equal(rerender.status, 0, rerender.output);
  assert.deepEqual([provenance().model, provenance().modelSource, provenance().effort], ['claude-test-1', 'self-report', undefined]);
});

// The quoted pair reaches the stamp and the renderer as two flags, because the wrapper word-splits its flags.
for (const flags of [['--functional', '--performance'], ['--functional --performance'], ['--functional', '--a11y']]) {
  test(`the wrapper refuses ${JSON.stringify(flags)} without stamping or rendering anything`, (t) => {
    const box = sandbox(t);
    const json = write(box, 'qa-report-functional.json', stampable());
    const before = fs.readFileSync(json, 'utf8');

    const { status, output } = run(box, WRAPPER, [json, ...flags]);

    assert.notEqual(status, 0, output);
    assert.equal(fs.readFileSync(json, 'utf8'), before, 'the report was stamped');
    assert.ok(!fs.existsSync(box.reportsDir), 'something was written under kosh-reports/');
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

const CAPTURE = [
  { type: 'visit', visit: 'a-1', url: 'https://example.com/' },
  { type: 'load', visit: 'a-1', loadTime: 900 },
  { type: 'visit', visit: 'a-2', url: 'https://other-client.example.org/' },
  { type: 'console', visit: 'a-2', level: 'error', text: 'another client' },
  { type: 'visit', visit: 'a-3', url: 'https://www.example.com/about/' },
  { type: 'network', visit: 'a-3', url: 'https://cdn.example.net/app.js', status: 404 },
  { type: 'truncated', reason: 'file' },
];
const captureAt = (box, session = SESSION) => path.join(box.reportsDir, 'data', `capture-${session}.jsonl`);
const writeCapture = (box, session, entries = CAPTURE) => {
  const file = captureAt(box, session);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\nnot json\n`);
  return file;
};
const archivedCapture = (box, suffix = '') => path.join(box.reportsDir, 'data', 'archive', `WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01${suffix}.capture.jsonl`);
const lines = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

test("a skill's rendered report takes its session's page capture, for its own host only", (t) => {
  const box = sandbox(t);
  const json = write(box, SKILL_OUTPUT, report());
  const capture = writeCapture(box);

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.match(output, /Page capture archived: .*\(2 visits on example\.com, 2 entries for other hosts or an earlier browser dropped\)/);
  assert.ok(!fs.existsSync(capture), 'the capture is still there for the next run to inherit');
  assert.deepEqual(lines(archivedCapture(box)), CAPTURE.filter((entry) => entry.visit !== 'a-2'));
});

test('a page that redirected off the report host mid-run stays in its capture', (t) => {
  const box = sandbox(t);
  const redirected = [
    { type: 'visit', visit: 'b-1', url: 'https://example.com/', redirectedFrom: [] },
    { type: 'visit', visit: 'b-2', url: 'https://shop.example.com/cart/', redirectedFrom: ['https://example.com/shop/'] },
    { type: 'network', visit: 'b-2', url: 'https://shop.example.com/cart.js', status: 404 },
    { type: 'visit', visit: 'b-3', url: 'https://cdn.example.net/x', redirectedFrom: ['https://other-client.example.org/go'] },
  ];
  writeCapture(box, SESSION, redirected);

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]);

  assert.equal(status, 0, output);
  assert.deepEqual(lines(archivedCapture(box)).map((entry) => entry.visit), ['b-1', 'b-2', 'b-2']);
});

test("another session's capture is left alone, and named in the warning", (t) => {
  const box = sandbox(t);
  const capture = writeCapture(box, 'another-session');

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]);

  assert.equal(status, 0, output);
  assert.match(output, /no page capture at .*capture-wrapper-test\.jsonl \(left alone: capture-another-session\.jsonl\)\. If this run's pages are in one of those, re-run from the Claude Code session that loaded them\./);
  assert.doesNotMatch(output, /restart Claude Code/);
  assert.ok(fs.existsSync(capture), "another session's capture was taken");
  assert.ok(!fs.existsSync(archivedCapture(box)));
});

test('a report the archiver cannot read leaves the capture where it was', (t) => {
  const box = sandbox(t);
  const capture = writeCapture(box);

  const { status } = spawnSync('node', [path.join(__dirname, '../scripts/archive-capture.js'), path.join(box.root, 'missing.json'), archivedCapture(box)], { env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir, CLAUDE_CODE_SESSION_ID: SESSION } });

  assert.notEqual(status, 0);
  assert.ok(fs.existsSync(capture), 'the capture was moved before the report was read');
});

test('a capture that cannot be archived is kept, and the warning says where', (t) => {
  const box = sandbox(t);
  const before = fs.readFileSync(writeCapture(box), 'utf8');
  fs.mkdirSync(archivedCapture(box), { recursive: true });

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]);

  assert.equal(status, 0, output);
  const stranded = output.match(/this run's capture is still at (\S+)/);
  assert.ok(stranded, output);
  assert.match(output, /could not archive this session's page capture/);
  assert.equal(fs.readFileSync(stranded[1], 'utf8'), before);
});

test("a rendered report that isn't a skill's own output leaves the capture alone", (t) => {
  const box = sandbox(t);
  const capture = writeCapture(box);

  assert.equal(run(box, WRAPPER, [write(box, 'qa-report-functional.json', report())]).status, 0);
  assert.equal(run(box, WRAPPER, [archiveCopy(box)]).status, 0);

  assert.ok(fs.existsSync(capture), 'a re-render took the capture of the run still in progress');
});

test('a same-day rerun moves the previous capture aside with its report', (t) => {
  const box = sandbox(t);
  writeCapture(box);
  assert.equal(run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]).status, 0);

  writeCapture(box);
  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report((r) => { r.timestamp = '2026-01-01T09:00:00Z'; }))]);

  assert.equal(status, 0, output);
  assert.equal(lines(archivedCapture(box, '_2026-01-01T00-00-00Z')).length, 5);
  assert.equal(lines(archivedCapture(box)).length, 5);
});

test("rendering the same report again keeps each run's capture beside its own JSON", (t) => {
  const box = sandbox(t);
  for (const loadTime of [900, 950]) {
    writeCapture(box, SESSION, [CAPTURE[0], { ...CAPTURE[1], loadTime }]);
    assert.equal(run(box, WRAPPER, [write(box, SKILL_OUTPUT, report())]).status, 0);
  }

  const reports = archived(box).filter((name) => name.endsWith('.json'));
  assert.equal(reports.length, 2);
  for (const name of reports) {
    const json = path.join(box.reportsDir, 'data', 'archive', name);
    const capture = fs.readFileSync(json.replace(/\.json$/, '.capture.jsonl'));
    assert.equal(JSON.parse(fs.readFileSync(json, 'utf8')).provenance.captureSha256, require('crypto').createHash('sha256').update(capture).digest('hex'), name);
  }
});

test("a skill's report is sealed to the capture the archive holds, whatever its type, and a copied hash is replaced", (t) => {
  const box = sandbox(t);
  writeCapture(box);
  fs.mkdirSync(path.dirname(archivedCapture(box)), { recursive: true });
  fs.writeFileSync(archivedCapture(box), 'an orphan left by hand\n');

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report((r) => { r.provenance = { model: 'claude-test-1', captureSha256: 'copied-from-another-run' }; }))]);

  assert.equal(status, 0, output);
  const { provenance } = JSON.parse(fs.readFileSync(archiveCopy(box), 'utf8'));
  assert.equal(provenance.captureSha256, require('crypto').createHash('sha256').update(fs.readFileSync(archivedCapture(box))).digest('hex'));
  assert.ok(provenance.seal);
});

test('a skill report with no visits on its host drops a copied captureSha256', (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, CAPTURE.filter((entry) => entry.visit === 'a-2'));

  assert.equal(run(box, WRAPPER, [write(box, SKILL_OUTPUT, report((r) => { r.provenance = { model: 'claude-test-1', captureSha256: 'copied-from-another-run' }; }))]).status, 0);

  assert.ok(!('captureSha256' in JSON.parse(fs.readFileSync(archiveCopy(box), 'utf8')).provenance));
});

test('a report with no url drops the capture with a warning', (t) => {
  const box = sandbox(t);
  const capture = writeCapture(box);

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, report((r) => { delete r.url; }))]);

  assert.equal(status, 0, output);
  assert.match(output, /no usable url, so this session's page capture \(7 entries\) was dropped/);
  assert.ok(!fs.existsSync(capture));
  assert.ok(!fs.existsSync(archivedCapture(box)));
});

for (const [where, name] of [
  ['named as a keeper', 'kosh-reports/data/qa-report-functional.2026-09-23.original.json'],
  ['in a subfolder of kosh-reports/data', 'kosh-reports/data/old/qa-report-functional.json'],
  ['outside kosh-reports/data', 'qa-report-functional.json'],
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
  const json = write(box, 'kosh-reports/data/qa-report-shop.json', report());

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
    assert.ok(!fs.existsSync(box.reportsDir), 'something was written under kosh-reports/');
  });
}

const PERFORMANCE_OUTPUT = 'kosh-reports/data/qa-report-performance.json';
const archivedPerformance = (box, ext = 'json') => path.join(box.reportsDir, 'data', 'archive', `WRAPPER_FIXTURE_PERFORMANCE_QA_REPORT_2026-01-01.${ext}`);
const performanceReport = (edit = () => {}) => report((r) => {
  Object.assign(r, { environment: 'production', visitedPages: ['https://example.com/'], provenance: { model: 'claude-test-1' } });
  edit(r);
});
const MEASURED = [
  { type: 'visit', visit: 'p-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
  { type: 'load', visit: 'p-1', viewport: { width: 1920, height: 1080 }, loadTime: 900, domContentLoaded: 500, ttfb: 80, transferSize: 4000, resourceTransferSize: 60000 },
  { type: 'vitals', visit: 'p-1', lcp: 700, cls: 0.01, settled: true },
  { type: 'visit', visit: 'p-2', url: 'https://other-client.example.org/', status: 200, redirectedFrom: [] },
];

test("a performance report's pages[] is built from the capture, replacing the model's, and sealed to the archived capture", (t) => {
  const box = sandbox(t);
  const earlierRun = [
    { type: 'visit', visit: 'p-0', browser: 'earlier', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    { type: 'load', visit: 'p-0', viewport: { width: 1920, height: 1080 }, loadTime: 5000, domContentLoaded: 500, ttfb: 80, transferSize: 4000, resourceTransferSize: 60000 },
  ];
  writeCapture(box, SESSION, [...earlierRun, ...MEASURED, { type: 'network', visit: 'p-1', url: 'https://example.com/sitemap.xml', status: 404, resourceType: 'fetch', byModel: true }, { type: 'console', visit: 'p-1', level: 'error', text: 'sitemap fetch failed', source: 'kosh-evaluate', byModel: true }]);
  const json = write(box, PERFORMANCE_OUTPUT, performanceReport((r) => { r.pages = [{ url: 'https://example.com/', loadTime: 1 }]; }));

  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.match(output, /Page capture merged: 1 page × viewport rows from 1 visits on example\.com, leaving out 2 rows from the model's own code and 1 visit from an earlier browser\n/);
  const archivedReport = JSON.parse(fs.readFileSync(archivedPerformance(box), 'utf8'));
  assert.deepEqual(archivedReport.pages.map(({ url, viewport, loadTime, lcp, network }) => [url, viewport, loadTime, lcp, network]), [['https://example.com/', '1920x1080', 900, 700, []]]);
  const capture = fs.readFileSync(archivedPerformance(box, 'capture.jsonl'));
  assert.match(String(capture), /"url":"https:\/\/example\.com\/sitemap\.xml".*"byModel":true/);
  assert.doesNotMatch(String(capture), /"p-0"/);
  assert.equal(archivedReport.provenance.captureSha256, require('crypto').createHash('sha256').update(capture).digest('hex'));
  assert.ok(archivedReport.provenance.seal);
  assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data')), ['archive']);
});

const INVENTED = (r) => { r.pages = buildPages(MEASURED).map((page) => ({ ...page, loadTime: 1, lcp: 1 })); };

test('a report with pages[] gets them from the capture whatever its name says', (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, MEASURED);

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, performanceReport(INVENTED))]);

  assert.equal(status, 0, output);
  const archivedReport = JSON.parse(fs.readFileSync(path.join(box.reportsDir, 'data', 'archive', 'WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json'), 'utf8'));
  assert.deepEqual(archivedReport.pages.map(({ loadTime, lcp }) => [loadTime, lcp]), [[900, 700]]);
});

for (const [output, flags] of [[PERFORMANCE_OUTPUT, ['--functional']], [SKILL_OUTPUT, ['--functional', '--performance']]]) {
  test(`${path.basename(output)} with ${flags.join(' ')} is refused before its capture is taken`, (t) => {
    const box = sandbox(t);
    writeCapture(box, SESSION, MEASURED);
    const json = write(box, output, performanceReport(INVENTED));
    const before = fs.readFileSync(json, 'utf8');

    const { status, output: printed } = run(box, WRAPPER, [json, ...flags]);

    assert.notEqual(status, 0, printed);
    assert.match(printed, /but was given --(functional|performance)\. Run it again with --\w+ or no flag\. Nothing was rendered\./);
    assert.equal(fs.readFileSync(json, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.join(box.reportsDir, 'data')).sort(), [path.basename(captureAt(box)), path.basename(output)].sort());
  });
}

test("a skill's own output with its own flag renders", (t) => {
  const box = sandbox(t);

  const { status, output } = run(box, WRAPPER, [write(box, SKILL_OUTPUT, stampable()), '--functional']);

  assert.equal(status, 0, output);
  assert.deepEqual(archived(box), ['WRAPPER_FIXTURE_FUNCTIONAL_QA_REPORT_2026-01-01.json']);
});

test("a performance report with rows the merge didn't write is refused, pointing at the skill's own path", (t) => {
  const box = sandbox(t);

  const { status, output } = run(box, WRAPPER, [write(box, 'kosh-reports/data/qa-report-performance-example.json', performanceReport(INVENTED))]);

  assert.notEqual(status, 0, output);
  assert.match(output, /pages\[\] has rows the page capture didn't write/);
  assert.ok(output.includes(path.join(box.reportsDir, 'data', 'qa-report-performance.json')), output);
  assert.ok(!fs.existsSync(archivedPerformance(box)), 'the report was archived');
});

test('a skill report with no provenance block still gets its pages from the capture, sealed to it', (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, MEASURED);

  const { status, output } = run(box, WRAPPER, [write(box, PERFORMANCE_OUTPUT, performanceReport((r) => { delete r.provenance; }))]);

  assert.equal(status, 0, output);
  const archivedReport = JSON.parse(fs.readFileSync(archivedPerformance(box), 'utf8'));
  assert.match(archivedReport.provenance.captureSha256, /^[0-9a-f]{64}$/);
  assert.equal(archivedReport.provenance.model, 'unknown');
  assert.deepEqual(archivedReport.pages.map(({ loadTime, lcp }) => [loadTime, lcp]), [[900, 700]]);
});

test("a merge that fails stops the render, so the model's numbers never reach a report", (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, MEASURED);
  fs.mkdirSync(`${captureAt(box)}.taken`);

  const { status, output } = run(box, WRAPPER, [write(box, PERFORMANCE_OUTPUT, performanceReport(INVENTED))]);

  assert.notEqual(status, 0, output);
  assert.match(output, /could not merge this session's page capture .* Nothing was rendered\./);
  assert.deepEqual(fs.readdirSync(box.reportsDir), ['data']);
});

test('a retry from a shell with no session id names the capture it left alone', (t) => {
  const box = sandbox(t);
  writeCapture(box, 'the-run', MEASURED);
  fs.renameSync(captureAt(box, 'the-run'), `${captureAt(box, 'the-run')}.taken`);
  const json = write(box, PERFORMANCE_OUTPUT, performanceReport());

  const { status, output } = spawnSync(WRAPPER, [json], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir, CLAUDE_CODE_SESSION_ID: '' } });

  assert.notEqual(status, 0);
  assert.match(output.join(''), /no page capture at .*capture\.jsonl \(left alone: capture-the-run\.jsonl\.taken\)\. If this run's pages are in one of those, re-run from the Claude Code session that loaded them\./);
  assert.doesNotMatch(output.join(''), /restart Claude Code/);
  assert.ok(fs.existsSync(`${captureAt(box, 'the-run')}.taken`));
});

test('a refused performance report keeps its capture, and the retry adds what the browser wrote since', (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, MEASURED.slice(0, 3));
  const json = write(box, PERFORMANCE_OUTPUT, performanceReport((r) => { r.visitedPages.push('https://example.com/about/'); }));

  const refused = run(box, WRAPPER, [json]);
  assert.notEqual(refused.status, 0, refused.output);
  assert.match(refused.output, /no record of loading:\n {2}https:\/\/example\.com\/about\//);

  writeCapture(box, SESSION, [{ type: 'visit', visit: 'p-3', url: 'https://example.com/about/', status: 200, redirectedFrom: [] }]);
  const { status, output } = run(box, WRAPPER, [json]);

  assert.equal(status, 0, output);
  assert.deepEqual(JSON.parse(fs.readFileSync(archivedPerformance(box), 'utf8')).pages.map((page) => page.url), ['https://example.com/', 'https://example.com/about/']);
  assert.equal(lines(archivedPerformance(box, 'capture.jsonl')).length, 4);
});

test('re-rendering an archived performance report keeps its pages[] and its seal', (t) => {
  const box = sandbox(t);
  writeCapture(box, SESSION, MEASURED);
  assert.equal(run(box, WRAPPER, [write(box, PERFORMANCE_OUTPUT, performanceReport())]).status, 0);
  const before = fs.readFileSync(archivedPerformance(box), 'utf8');
  writeCapture(box, SESSION, MEASURED);

  const { status, output } = run(box, WRAPPER, [archivedPerformance(box)]);

  assert.equal(status, 0, output);
  assert.match(output, /Provenance \(kept\)/);
  assert.equal(fs.readFileSync(archivedPerformance(box), 'utf8'), before);
  assert.ok(fs.existsSync(captureAt(box)), "a re-render took the next run's capture");
});
