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

const render = ({ root, reportsDir }, screenshots, pages) => {
  const input = path.join(root, 'qa-report-functional.json');
  fs.writeFileSync(input, JSON.stringify({
    websiteName: 'Kosh Render Fixture',
    url: 'https://example.com',
    timestamp: '2026-01-01T00:00:00Z',
    issues: {
      critical: [],
      high: [{ category: 'Layout', issue: 'Broken hero', impact: 'Looks wrong', screenshots, pages }],
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

test('a javascript: href hidden behind control characters is never linked', (t) => {
  const hostile = [
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'JaVa\tScRiPt:alert(1)',
    '\u0001javascript:alert(1)',
    ' \tjavascript:alert(1)',
  ];

  const { html } = render(sandbox(t), [], hostile);

  assert.ok(!/<a href="[^"]*script:/i.test(html));
  assert.equal(html.match(/alert\(1\)/g).length, hostile.length);
});

test('ordinary page links still render, with stray control characters removed', (t) => {
  const pages = ['https://example.com/about', '/pricing', '#faq', 'https://example.com/search?q=a&page=2', 'https://example.com/contact\n'];

  const { html } = render(sandbox(t), [], pages);

  assert.ok(html.includes('<a href="https://example.com/about"'));
  assert.ok(html.includes('<a href="/pricing"'));
  assert.ok(html.includes('<a href="#faq"'));
  assert.ok(html.includes('<a href="https://example.com/search?q=a&amp;page=2"'));
  assert.ok(html.includes('<a href="https://example.com/contact"'));
});

test('an AEO-shaped report missing mode is refused without advice that cannot work', (t) => {
  const { root, reportsDir } = sandbox(t);
  const input = path.join(root, 'report.json');
  fs.writeFileSync(input, JSON.stringify({ criteria: { technicalHealth: {}, structuredData: {}, aeoReadiness: {} } }));

  const { status, stderr } = spawnSync('node', [GENERATOR, input, '--aeo'], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: reportsDir } });

  assert.notEqual(status, 0);
  assert.match(stderr, /missing `mode: "aeo"`/);
  assert.doesNotMatch(stderr, /--aeo/);
});

test('both renderers forbid scripts, and neither report needs one', (t) => {
  const box = sandbox(t);
  const aeo = spawnSync('node', [GENERATOR, path.join(__dirname, 'fixtures/aeo.json'), '--aeo'], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: box.reportsDir } });
  assert.equal(aeo.status, 0, aeo.stderr);
  const aeoHtml = fs.readFileSync(aeo.stdout.match(/^HTML report generated: (.+)$/m)[1], 'utf8');

  for (const html of [render(box, []).html, aeoHtml]) {
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`));
    assert.doesNotMatch(html, /<script|\son[a-z]+\s*=/i);
  }
});

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const renderPerformance = ({ root, reportsDir }, report, flags = []) => {
  const input = path.join(root, 'qa-report-performance.json');
  fs.writeFileSync(input, JSON.stringify(report));
  const { status, stdout, stderr } = spawnSync('node', [GENERATOR, input, '--performance', ...flags], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: reportsDir } });
  assert.equal(status, 0, stdout + stderr);
  return fs.readFileSync(stdout.match(/^HTML report generated: (.+)$/m)[1], 'utf8');
};
const withPages = (rows, edit = () => {}) => {
  const report = fixture('performance-opus-5-5-2026-10-13.json');
  report.pages = report.pages.slice(0, rows.length).map((page, i) => ({ ...page, ...rows[i] }));
  report.visitedPages = [...new Set(report.pages.map((page) => page.url))];
  edit(report);
  return report;
};
const cells = (html, metric) => [...html.matchAll(/<td class="vital vital--(\w+)">([^<]*)/g)].filter((_, i) => i % 2 === (metric === 'lcp' ? 0 : 1)).map(([, band, value]) => `${value} ${band}`);

test('LCP and CLS are banded at the Core Web Vitals thresholds, with an unsettled read marked', (t) => {
  const html = renderPerformance(sandbox(t), withPages([
    { lcp: 2500, cls: 0.1 }, { lcp: 2501, cls: 0.1004 }, { lcp: 4000, cls: 0.25 }, { lcp: 4001, cls: 0.251, vitalsSettled: false },
  ]));

  assert.deepEqual(cells(html, 'lcp'), ['2.500 s good', '2.501 s fair', '4.000 s fair', '4.001 s* poor']);
  assert.deepEqual(cells(html, 'cls'), ['0.100 good', '0.100 good', '0.250 fair', '0.251* poor'], 'a value shown as a threshold is in that threshold\'s band');
  assert.match(html, /LCP good up to 2\.5 s, poor over 4 s; CLS good up to 0\.1, poor over 0\.25/);
  assert.doesNotMatch(html, /passes Core Web Vitals/i);
});

test('a message on every page that loaded is site-wide, and the rest name their pages', (t) => {
  const error = { level: 'error', text: 'Uncaught TypeError' };
  const html = renderPerformance(sandbox(t), withPages([
    { console: [error] }, { console: [error, { level: 'warning', text: 'only here' }] }, { failure: 'net::ERR_FAILED', status: null, console: [] },
  ]));

  assert.match(html, /<code>error: Uncaught TypeError<\/code> <span class="muted">Site-wide<\/span>/);
  assert.match(html, /<code>warning: only here<\/code> <span class="muted">\/videos\/ \(Desktop 1920×1080\)<\/span>/);
  assert.match(html, /<span class="page-status">Failed: net::ERR_FAILED<\/span>/);
});

// The HTML document is fetched on every load, so only the files' own transfer shows a warm cache.
test("a page's files are a column of their own, so a warm load reads as 0 KB", (t) => {
  const html = renderPerformance(sandbox(t), withPages([{ transferSize: 33715, resourceTransferSize: 0 }, { transferSize: null, resourceTransferSize: null }]));

  assert.match(html, /<td class="num">33 KB<\/td>\s*<td class="num">0 KB<\/td>/);
  assert.match(html, /<td class="num">—<\/td>\s*<td class="num">—<\/td>/);
  assert.match(html, /<th scope="col">HTML<\/th><th scope="col">Files<\/th>/);
});

test('a message missing from one loaded page, or seen on the only one, is not site-wide', (t) => {
  const box = sandbox(t);
  const error = { level: 'error', text: 'Uncaught TypeError' };

  assert.doesNotMatch(renderPerformance(box, withPages([{ console: [error] }, { console: [] }, { failure: 'net::ERR_FAILED', status: null, console: [error] }])), /Site-wide/);
  assert.doesNotMatch(renderPerformance(box, withPages([{ console: [error] }])), /Site-wide/);
});

test('fewer than four covered pages is flagged, and four is not', (t) => {
  const box = sandbox(t);
  assert.match(renderPerformance(box, withPages([{}, {}, {}])), /This run covered 3 pages; the performance check covers at least 4/);
  assert.doesNotMatch(renderPerformance(box, withPages([{}, {}, {}, {}])), /This run covered/);
});

// Every string in pages[] was written by the tested site or read off it.
test('site text in the page table renders as text, and no site URL becomes a script link', (t) => {
  const hostile = '<img src=x onerror=alert(1)>';
  const html = renderPerformance(sandbox(t), withPages([{
    url: 'https://example.com/"><img/src=x/onerror=alert(1)>',
    viewport: `1x1${hostile}`,
    failure: hostile,
    status: null,
    visits: `2${hostile}`,
    console: [{ level: hostile, text: hostile, source: 'javascript:alert(1)' }],
    network: [{ url: 'javascript:alert(1)', status: null, failure: hostile, resourceType: hostile }],
  }]), ['--skip-validation']);

  const table = html.slice(html.indexOf('<section class="pages-measured">'), html.indexOf('</section>', html.indexOf('<section class="pages-measured">')));
  assert.doesNotMatch(table, /<img|onerror=alert\(1\)>|href="javascript/i);
  assert.match(table, /Failed: &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(table, /<code>&lt;img src=x onerror=alert\(1\)&gt;: &lt;img src=x onerror=alert\(1\)&gt;<\/code>/);
  assert.match(table, /<td>unknown viewport<\/td>/);
  assert.doesNotMatch(html, /<script|<[^>]*\son[a-z]+\s*=/i);
});

test('a performance report from before pages[] still renders, with no page table', (t) => {
  const html = renderPerformance(sandbox(t), fixture('performance-opus-5-5-run-3.json'), ['--skip-validation']);

  assert.match(html, /<title>kosh performance QA report/);
  assert.doesNotMatch(html, /pages-measured"/);
});

test('a report with no methodology prints none, rather than "Not recorded."', (t) => {
  const html = renderPerformance(sandbox(t), withPages([{}], (r) => { delete r.testMethodology; }));

  assert.match(html, /<h2>Methodology<\/h2>\s*<div class="visited-pages">/);
});
