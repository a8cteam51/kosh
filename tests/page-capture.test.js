const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildPages, reportEntries, take, uncovered } = require('../scripts/page-capture.js');

const DESKTOP = { width: 1920, height: 1080 };
const MOBILE = { width: 375, height: 812 };
const load = (visit, viewport, loadTime, more = {}) => ({ type: 'load', visit, viewport, loadTime, domContentLoaded: 1, ttfb: 1, transferSize: 1, resourceTransferSize: 1, ...more });

test('the first visit per page and viewport is the measurement, and a revisit only adds its rows', () => {
  const pages = buildPages([
    { type: 'visit', visit: 'a-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('a-1', DESKTOP, 2600),
    { type: 'vitals', visit: 'a-1', lcp: 1800, cls: 0.12, settled: true },
    { type: 'console', visit: 'a-1', level: 'error', text: 'boom', source: 'https://example.com/app.js' },
    { type: 'visit', visit: 'a-2', url: 'https://example.com/#top', status: 200, redirectedFrom: ['https://example.com/index.php'] },
    load('a-2', DESKTOP, 380),
    { type: 'vitals', visit: 'a-2', lcp: 200, cls: 0, settled: true },
    { type: 'console', visit: 'a-2', level: 'error', text: 'boom', source: 'https://example.com/app.js' },
    { type: 'network', visit: 'a-2', url: 'https://cdn.example.net/font.woff2', status: 404, resourceType: 'font' },
    { type: 'visit', visit: 'a-3', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('a-3', MOBILE, 900),
  ]);

  assert.deepEqual(pages.map((page) => [page.viewport, page.visits, page.loadTime, page.lcp, page.cls]), [['1920x1080', 2, 2600, 1800, 0.12], ['375x812', 1, 900, null, null]]);
  assert.deepEqual(pages[0].redirectedFrom, ['https://example.com/index.php']);
  assert.equal(pages[0].console.length, 1, 'the same message on a revisit is listed twice');
  assert.deepEqual(pages[0].network, [{ url: 'https://cdn.example.net/font.woff2', status: 404, resourceType: 'font' }]);
});

test("a report keeps the visits from the last browser that loaded its site, and a capture from before browsers were named stays whole", () => {
  const visit = (id, browser, url = 'https://example.com/') => ({ type: 'visit', visit: id, ...(browser && { browser }), url, status: 200, redirectedFrom: [] });
  const kept = (entries) => reportEntries(entries, 'https://example.com/').map((entry) => entry.visit);

  assert.deepEqual(kept([visit('a-1', 'b1'), { type: 'console', visit: 'a-1', level: 'error', text: 'old' }, visit('a-2', 'b2'), visit('a-3', 'b2'), visit('a-4', 'b3', 'https://other.example.org/')]), ['a-2', 'a-3']);
  assert.deepEqual(kept([visit('a-1'), visit('a-2')]), ['a-1', 'a-2']);
});

test('a row is marked logged in only when its first load saw the logged-in class', () => {
  const pages = buildPages([
    { type: 'visit', visit: 'a-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('a-1', DESKTOP, 900, { loggedIn: true }),
    { type: 'visit', visit: 'a-2', url: 'https://example.com/about/', status: 200, redirectedFrom: [] },
    load('a-2', DESKTOP, 900, { loggedIn: 'true' }),
  ]);

  assert.deepEqual(pages.map((page) => page.loggedIn), [true, undefined]);
});

test("rows from the model's own requests stay out of the page's rows", () => {
  const [page] = buildPages([
    { type: 'visit', visit: 'a-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('a-1', DESKTOP, 900),
    { type: 'network', visit: 'a-1', url: 'https://example.com/sitemap.xml', status: 404, resourceType: 'fetch', byModel: true },
    { type: 'console', visit: 'a-1', level: 'error', text: 'Failed to load resource: the server responded with a status of 404 ()', source: 'https://example.com/sitemap.xml', byModel: true },
    { type: 'network', visit: 'a-1', url: 'https://example.com/font.woff2', status: 404, resourceType: 'font' },
  ]);

  assert.deepEqual(page.network.map((row) => row.url), ['https://example.com/font.woff2']);
  assert.deepEqual(page.console, []);
});

test('a failed visit, a lost timing read and a cut-off visit keep their rows, with nulls for what was not measured', () => {
  const pages = buildPages([
    { type: 'visit', visit: 'b-1', url: 'https://example.com/down/', status: null, redirectedFrom: [], failure: 'net::ERR_CONNECTION_REFUSED' },
    { type: 'visit', visit: 'b-2', url: 'https://example.com/slow/', status: 200, redirectedFrom: [] },
    { type: 'load', visit: 'b-2', viewport: DESKTOP, loadTime: null, error: 'the timing came from another document' },
    { type: 'truncated', visit: 'b-2', reason: 'rows' },
    { type: 'console', visit: 'nobody', level: 'error', text: 'a row whose visit line was dropped' },
  ]);

  assert.deepEqual(pages.map(({ url, viewport, failure, loadTime, timingError, vitalsSettled, truncated }) => ({ url, viewport, failure, loadTime, timingError, vitalsSettled, truncated })), [
    { url: 'https://example.com/down/', viewport: null, failure: 'net::ERR_CONNECTION_REFUSED', loadTime: null, timingError: undefined, vitalsSettled: null, truncated: undefined },
    { url: 'https://example.com/slow/', viewport: '1920x1080', failure: undefined, loadTime: null, timingError: 'the timing came from another document', vitalsSettled: null, truncated: true },
  ]);
});

test('a value a patched page made up is dropped, not passed on', () => {
  const [page] = buildPages([
    { type: 'visit', visit: 'd-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('d-1', { width: '<b>', height: 812 }, '1200', { ttfb: Infinity }),
    { type: 'vitals', visit: 'd-1', lcp: { toString: 'x' }, cls: NaN, settled: 'yes' },
  ]);

  assert.deepStrictEqual([page.viewport, page.loadTime, page.ttfb, page.domContentLoaded, page.lcp, page.cls, page.vitalsSettled], [null, null, null, 1, null, null, false]);
});

test('a visit\'s last vitals line is its value', () => {
  const [page] = buildPages([
    { type: 'visit', visit: 'e-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('e-1', DESKTOP, 1000),
    { type: 'vitals', visit: 'e-1', lcp: 300, cls: 0, settled: false },
    { type: 'vitals', visit: 'e-1', lcp: 300, cls: 0.12, settled: true },
  ]);

  assert.deepStrictEqual([page.lcp, page.cls, page.vitalsSettled], [300, 0.12, true]);
});

test('a gate page is left out, so the page loaded after the login is the measurement', () => {
  const pages = buildPages([
    { type: 'visit', visit: 'g-1', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('g-1', DESKTOP, 300, { gate: 'coming-soon' }),
    { type: 'vitals', visit: 'g-1', lcp: 100, cls: 0, settled: true },
    { type: 'visit', visit: 'g-2', url: 'https://example.com/', status: 200, redirectedFrom: [] },
    load('g-2', DESKTOP, 2400),
    { type: 'visit', visit: 'g-3', url: 'https://example.com/members/', status: 200, redirectedFrom: [] },
    load('g-3', DESKTOP, 200, { gate: 'password-protected' }),
  ]);

  assert.deepEqual(pages.map((page) => [page.url, page.visits, page.loadTime]), [['https://example.com/', 1, 2400]]);
  assert.deepEqual(uncovered(['https://example.com/', 'https://example.com/members/'], pages), ['https://example.com/members/']);
});

test('a listed page is covered by its own url or a url that redirected to it, whatever its fragment', () => {
  const pages = [{ url: 'https://example.com/donate/', redirectedFrom: ['https://example.com/donate'] }];

  assert.deepEqual(uncovered(['https://example.com/donate/#form', 'https://EXAMPLE.com/donate', 'https://example.com/about/', 'not a url'], pages), ['https://example.com/about/', 'not a url']);
});

test("a listed page with a share key is covered by its row, which never had one, and a page's own query still tells it apart", () => {
  const visit = (id, url) => ({ type: 'visit', visit: id, url, status: 200, redirectedFrom: [] });
  const pages = buildPages([visit('a-1', 'https://example.com/'), visit('a-2', 'https://example.com/?product=blue-shirt')]);

  assert.deepEqual(pages.map((page) => page.url), ['https://example.com/', 'https://example.com/?product=blue-shirt']);
  assert.deepEqual(uncovered(['https://example.com/?share=secret', 'https://example.com/?product=blue-shirt&share=secret', 'https://example.com/?product=red-shirt'], pages), ['https://example.com/?product=red-shirt']);
});

test('taking the capture again adds what the browser wrote since to what was taken before', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-take-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const live = path.join(dir, 'capture-s.jsonl');

  fs.writeFileSync(live, 'one\n');
  const taken = take(live);
  fs.writeFileSync(live, 'two\n');
  take(live);
  take(live);

  assert.equal(fs.readFileSync(taken, 'utf8'), 'one\ntwo\n');
  assert.ok(!fs.existsSync(live));
});

test('the summary prints the rows for the site and names the pages with no visit yet, without taking the capture', (t) => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-summary-'));
  t.after(() => fs.rmSync(reportsDir, { recursive: true, force: true }));
  const live = path.join(reportsDir, 'data', 'capture-s.jsonl');
  fs.mkdirSync(path.dirname(live), { recursive: true });
  fs.writeFileSync(`${live}.taken`, `${JSON.stringify({ type: 'visit', visit: 'c-1', url: 'https://example.com/', redirectedFrom: [] })}\n`);
  fs.writeFileSync(live, [
    { type: 'visit', visit: 'c-2', url: 'https://www.example.com/about/', redirectedFrom: [] },
    { type: 'visit', visit: 'c-3', url: 'https://other-client.example.org/', redirectedFrom: [] },
  ].map((entry) => JSON.stringify(entry)).join('\n'));

  const { status, stdout } = spawnSync('node', [path.join(__dirname, '../scripts/page-capture.js'), 'summary', 'https://example.com/', 'https://example.com/about/', 'https://example.com/contact/'], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: reportsDir, CLAUDE_CODE_SESSION_ID: 's' } });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout.slice(0, stdout.lastIndexOf(']') + 1)).map((page) => page.url), ['https://example.com/', 'https://www.example.com/about/']);
  assert.match(stdout, /No visit captured yet for: https:\/\/example\.com\/contact\/\n$/);
  assert.ok(fs.existsSync(live), 'the summary took the live capture');
});
