const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GENERATOR = path.join(__dirname, '../scripts/generate-report.js');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const sandbox = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-render-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportsDir = path.join(root, 'reports');
  fs.mkdirSync(path.join(reportsDir, 'screenshots'), { recursive: true });
  return { root, reportsDir };
};

const render = ({ root, reportsDir }, screenshots) => {
  const input = path.join(root, 'qa-report-functional.json');
  fs.writeFileSync(input, JSON.stringify({
    websiteName: 'Kosh Render Fixture',
    url: 'https://example.com',
    timestamp: '2026-01-01T00:00:00Z',
    issues: {
      critical: [],
      high: [{ category: 'Layout', issue: 'Broken hero', impact: 'Looks wrong', screenshots }],
      medium: [],
      low: [],
    },
  }));

  const { status, stdout, stderr } = spawnSync('node', [GENERATOR, input, '--functional'], {
    encoding: 'utf8',
    env: { ...process.env, KOSH_REPORTS_DIR: reportsDir },
  });
  assert.equal(status, 0, stderr);
  const printed = stdout.match(/^HTML report generated: (.+)$/m);
  assert.ok(printed, `generator did not print its output path:\n${stdout}`);
  assert.ok(printed[1].startsWith(reportsDir + path.sep), `report written outside KOSH_REPORTS_DIR: ${printed[1]}`);
  return { html: fs.readFileSync(printed[1], 'utf8'), stdout, stderr };
};

test('a screenshot is inlined, so the report survives the file being overwritten', (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.reportsDir, 'screenshots', 'hero.png'), PNG);

  const { html, stdout, stderr } = render(box, ['screenshots/hero.png']);

  assert.ok(html.includes(`src="data:image/png;base64,${PNG.toString('base64')}"`));
  assert.ok(html.includes('<details class="screenshot__expand"><summary title="Expand screenshot"><img src="data:'));
  assert.ok(!html.includes('src="screenshots/'));
  assert.ok(!html.includes('href="screenshots/'));
  assert.match(stdout, /^Screenshots inlined: 1, report size \d+ KB$/m);
  assert.equal(stderr, '');
});

test('a missing screenshot keeps its external reference and warns', (t) => {
  const { html, stdout, stderr } = render(sandbox(t), ['screenshots/missing.png']);

  assert.ok(html.includes('<a href="screenshots/missing.png"'));
  assert.ok(html.includes('src="screenshots/missing.png"'));
  assert.ok(!html.includes('<details class="screenshot__expand">'));
  assert.match(stderr, /not inlined, left as an external reference: screenshots\/missing\.png/);
  assert.ok(!stdout.includes('Screenshots inlined'));
});

test('a path that climbs out of reports/ is neither inlined nor referenced', (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.root, 'outside.png'), PNG);

  const climbing = ['../outside.png', 'screenshots/../../outside.png'];

  const { html, stderr } = render(box, climbing);

  assert.ok(!html.includes('src="data:'));
  assert.ok(!html.includes('outside.png'));
  assert.equal(stderr.match(/dropped \(not a path inside reports\/\)/g).length, climbing.length);
});

test('an absolute path is neither inlined nor referenced', (t) => {
  const box = sandbox(t);
  const outside = path.join(box.root, 'outside.png');
  fs.writeFileSync(outside, PNG);

  const { html, stderr } = render(box, [outside]);

  assert.ok(!html.includes('src="data:'));
  assert.ok(!html.includes(outside));
  assert.match(stderr, /dropped \(not a path inside reports\/\)/);
});

test('a non-image file inside reports/ is not inlined', (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.reportsDir, 'screenshots', 'notes.txt'), 'not an image');

  const { html } = render(box, ['screenshots/notes.txt']);

  assert.ok(!html.includes('src="data:'));
});

test('a remote or scheme-carrying screenshot never reaches the HTML', (t) => {
  const urls = ['https://tracker.example/pixel.png', '//tracker.example/pixel.png', 'java\tscript:alert(1)//.png'];

  const { html, stderr } = render(sandbox(t), urls);

  assert.ok(!html.includes('tracker.example'));
  assert.ok(!html.includes('alert(1)'));
  assert.ok(!html.includes('<figure class="screenshot">'));
  assert.equal(stderr.match(/dropped \(not a path inside reports\/\)/g).length, urls.length);
});
