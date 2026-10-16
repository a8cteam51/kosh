const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../scripts/compare-runs.js');
const fixture = (name) => path.join(__dirname, 'fixtures', name);
const compare = (...files) => {
  const { status, stdout, stderr } = spawnSync('node', [SCRIPT, ...files], { encoding: 'utf8' });
  assert.equal(status, 0, stderr);
  return stdout;
};

test('a run from before pages[] prints its homepage numbers, its filter check and its invented keys', () => {
  const out = compare(fixture('performance-opus-5-run-1.json'));

  assert.match(out, /^=== performance-opus-5-run-1\.json — 2026-09-22T15:19:32Z — model claude-opus-5\[1m\] — effort \?$/m);
  assert.match(out, /^invented keys: summary$/m);
  assert.match(out, /^homepage: desktop 413ms console=2 network=0 \| mobile 205ms console=2 network=0$/m);
  assert.match(out, /^filter check \(should be 0\): analytics\/3xx\/OPTIONS in network: 0$/m);
  assert.match(out, /^ {2}low\tJavaScript\t\/,\/documentation\/,/m);
});

test('a run with pages[] prints a row per page and viewport, with the inputs that produced it', () => {
  const out = compare(fixture('performance-opus-5-5-2026-10-13.json'));

  assert.match(out, /^inputs: skill 61a863adbe24 collectors 23cd057b5539 capture [0-9a-f]{12} mcp @playwright\/mcp@0\.0\.82 /m);
  assert.match(out, /^ {2}\/video\/sample-video-one\/\t1920x1080\tLCP —\tCLS —\tload 2600 ms\thtml 26 KB\tfiles 1 KB\tconsole 0\tfailed 0\tvisits 2$/m);
  assert.match(out, /^ {2}\/donate\/\t375x812\t.*\thtml 26 KB\tfiles 0 KB\t/m);
  assert.doesNotMatch(out, /filter check/);
});

test('a page with no transfer measured prints a dash, not 0 KB', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-compare-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = JSON.parse(fs.readFileSync(fixture('performance-opus-5-5-2026-10-14.json'), 'utf8'));
  report.pages = [{ ...report.pages[0], transferSize: null, resourceTransferSize: null }];
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(report));

  assert.match(compare(path.join(dir, 'run.json')), /\thtml —\tfiles —\t/);
});

test('a page measured logged in says so, so a logged-in run never passes for a faster visitor run', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-compare-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = JSON.parse(fs.readFileSync(fixture('performance-opus-5-5-2026-10-14.json'), 'utf8'));
  report.pages = [{ ...report.pages[0], loggedIn: true }, { ...report.pages[0], viewport: '375x812' }];
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(report));

  const rows = compare(path.join(dir, 'run.json')).split('\n').filter((line) => /\tfailed /.test(line));
  assert.deepEqual(rows.map((row) => row.endsWith('\tlogged in')), [true, false]);
});

test('runs print one block each, in the order given', () => {
  const out = compare(fixture('performance-opus-5-5-2026-10-13.json'), fixture('performance-opus-5-run-3.json'));

  assert.deepEqual([...out.matchAll(/^=== (\S+)/gm)].map((match) => match[1]), ['performance-opus-5-5-2026-10-13.json', 'performance-opus-5-run-3.json']);
});
