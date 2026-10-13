const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const capture = require('../collectors/capture.js');

const TIMING = { viewport: { width: 1920, height: 1080 }, loadTime: 1200, domContentLoaded: 800, ttfb: 100, transferSize: 5000, resourceTransferSize: 90000, navType: 'navigate' };

// Points the capture at a temp reports/ and returns a reader for what it wrote.
const sandbox = (t, session = 'test-session') => {
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-capture-'));
  const saved = { KOSH_REPORTS_DIR: process.env.KOSH_REPORTS_DIR, CLAUDE_CODE_SESSION_ID: process.env.CLAUDE_CODE_SESSION_ID };
  process.env.KOSH_REPORTS_DIR = reportsDir;
  process.env.CLAUDE_CODE_SESSION_ID = session;
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
    fs.rmSync(reportsDir, { recursive: true, force: true });
  });
  const file = path.join(reportsDir, 'data', `capture-${session}.jsonl`);
  const entries = () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  return { reportsDir, file, entries };
};

// Like Playwright headed, viewportSize() is null; the viewport comes from the page.
const fakePage = ({ url = 'about:blank', evaluate, history } = {}) => {
  const page = new EventEmitter();
  let at = url;
  const main = { url: () => at };
  return Object.assign(page, {
    main,
    setUrl: (next) => { at = next; },
    url: () => at,
    viewportSize: () => null,
    mainFrame: () => main,
    evaluate: evaluate || (async (fn) => (String(fn).includes('readyState') ? 'loading' : { documentUrl: at, ...TIMING })),
    ...history,
  });
};

const request = (url, { navigation = false, frame, from = null, type = 'document', failure, existing = null } = {}) => ({
  url: () => url,
  isNavigationRequest: () => navigation,
  frame: () => frame,
  redirectedFrom: () => from,
  resourceType: () => type,
  failure: () => (failure ? { errorText: failure } : null),
  existingResponse: () => existing,
});
const response = (req, status) => ({ request: () => req, status: () => status, url: () => req.url() });
const message = (type, text, url = 'https://example.com/app.js') => ({ type: () => type, text: () => text, location: () => ({ url }) });

const settle = () => new Promise((resolve) => setImmediate(resolve));

const start = async (page) => {
  await capture.default({ page });
  await settle();
  return page;
};

const navigate = async (page, url, { status = 200, redirects = [] } = {}) => {
  let previous = null;
  for (const [hop, hopStatus] of [...redirects, [url, status]]) {
    const req = request(hop, { navigation: true, frame: page.main, from: previous });
    page.emit('request', req);
    page.emit('response', response(req, hopStatus));
    previous = req;
  }
  page.setUrl(url);
  page.emit('framenavigated', page.main);
  page.emit('load', page);
  await settle();
};

const ofType = (entries, type) => entries.filter((entry) => entry.type === type);

test('a navigation is one visit with its load', async (t) => {
  const box = sandbox(t);
  await navigate(await start(fakePage()), 'https://example.com/');

  const [visit, load] = box.entries();
  assert.deepStrictEqual({ ...visit, at: undefined }, { at: undefined, type: 'visit', visit: visit.visit, url: 'https://example.com/', status: 200, redirectedFrom: [] });
  assert.deepStrictEqual({ ...load, at: undefined }, { at: undefined, type: 'load', visit: visit.visit, ...TIMING });
});

test('a redirect is one visit at the final url', async (t) => {
  const box = sandbox(t);
  await navigate(await start(fakePage()), 'https://example.com/new/', { redirects: [['https://example.com/old/', 301]] });

  const visits = ofType(box.entries(), 'visit');
  assert.strictEqual(visits.length, 1);
  assert.strictEqual(visits[0].url, 'https://example.com/new/');
  assert.strictEqual(visits[0].status, 200);
  assert.deepStrictEqual(visits[0].redirectedFrom, ['https://example.com/old/']);
});

test('a same-document navigation is not a visit', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.setUrl('https://example.com/#contact');
  page.emit('framenavigated', page.main);
  page.emit('console', message('error', 'after the hash jump'));

  const entries = box.entries();
  assert.strictEqual(ofType(entries, 'visit').length, 1);
  assert.strictEqual(ofType(entries, 'console')[0].visit, entries[0].visit);
});

test('a request the old page loses mid-navigation stays with the old page', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('request', request('https://example.com/about/', { navigation: true, frame: page.main }));
  page.emit('requestfailed', request('https://www.google-analytics.com/g/collect', { frame: page.main, type: 'ping', failure: 'net::ERR_ABORTED' }));
  page.setUrl('https://example.com/about/');
  page.emit('framenavigated', page.main);

  const [first, second] = ofType(box.entries(), 'visit');
  assert.strictEqual(second.url, 'https://example.com/about/');
  assert.strictEqual(ofType(box.entries(), 'network')[0].visit, first.visit);
});

test("a document's own status is on its visit line, not a network row", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  await navigate(page, 'https://example.com/missing/', { status: 404 });

  const [, missing] = ofType(box.entries(), 'visit');
  assert.strictEqual(missing.status, 404);
  assert.deepStrictEqual(ofType(box.entries(), 'network'), []);
});

test('a navigation that never commits, like a 204 or a download, is not a visit', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  const download = request('https://example.com/file.zip', { navigation: true, frame: page.main, failure: 'net::ERR_ABORTED' });
  page.emit('request', download);
  page.emit('response', response(download, 200));
  page.emit('requestfailed', download);
  page.setUrl('https://example.com/#after');
  page.emit('framenavigated', page.main);
  page.setUrl('https://example.com/pushed/');
  page.emit('framenavigated', page.main);
  page.emit('console', message('error', 'after the hash jump and pushState'));

  const entries = box.entries();
  assert.deepStrictEqual(ofType(entries, 'visit').map((visit) => visit.url), ['https://example.com/']);
  assert.strictEqual(ofType(entries, 'console')[0].visit, entries[0].visit);
  assert.deepStrictEqual(ofType(entries, 'network'), []);
});

test("a cancelled navigation's failure stays off the navigation that replaced it", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  const cancelled = request('https://example.com/slow/', { navigation: true, frame: page.main, failure: 'net::ERR_ABORTED' });
  const replacement = request('https://example.com/b/', { navigation: true, frame: page.main });
  page.emit('request', cancelled);
  page.emit('request', replacement);
  page.emit('response', response(replacement, 200));
  page.emit('requestfailed', cancelled);
  page.emit('response', response(cancelled, 500));
  page.setUrl('https://example.com/b/');
  page.emit('framenavigated', page.main);

  const entries = box.entries();
  const visits = ofType(entries, 'visit');
  assert.deepStrictEqual(visits.map(({ url, status, failure }) => [url, status, failure]), [['https://example.com/', 200, undefined], ['https://example.com/b/', 200, undefined]]);
  assert.deepStrictEqual(entries.filter((entry) => !visits.some((visit) => visit.visit === entry.visit)), []);
});

test("a replaced navigation's late redirect doesn't touch the navigation that replaced it", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  const replaced = request('https://example.com/old/', { navigation: true, frame: page.main });
  const replacement = request('https://example.com/b/', { navigation: true, frame: page.main });
  page.emit('request', replaced);
  page.emit('request', replacement);
  page.emit('request', request('https://example.com/new/', { navigation: true, frame: page.main, from: replaced }));
  page.emit('response', response(replacement, 200));
  page.setUrl('https://example.com/b/');
  page.emit('framenavigated', page.main);

  assert.deepStrictEqual(ofType(box.entries(), 'visit').map(({ url, redirectedFrom }) => [url, redirectedFrom]), [['https://example.com/b/', []]]);
});

test('a page that is not a web page ends the current visit', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.setUrl('data:text/html,<p>hi</p>');
  page.emit('framenavigated', page.main);
  page.emit('console', message('error', 'from the data: page'));

  assert.deepStrictEqual(ofType(box.entries(), 'console'), []);
});

test('a failed navigation is a visit with its failure, and no load from the error page', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  const refused = request('https://example.com/down/', { navigation: true, frame: page.main, failure: 'net::ERR_CONNECTION_REFUSED' });
  page.emit('request', refused);
  page.emit('requestfailed', refused);
  page.setUrl('chrome-error://chromewebdata/');
  page.emit('framenavigated', page.main);
  page.emit('load', page);
  await settle();

  const entries = box.entries();
  assert.deepStrictEqual(ofType(entries, 'visit').map(({ url, failure }) => [url, failure]), [['https://example.com/down/', 'net::ERR_CONNECTION_REFUSED']]);
  assert.deepStrictEqual(ofType(entries, 'load'), []);
});

test("a timing read that lands on the next document isn't recorded as this visit's", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage({ evaluate: async () => ({ documentUrl: 'https://example.com/next/', ...TIMING }) }));
  await navigate(page, 'https://example.com/redirects-on-load/');

  const [load] = ofType(box.entries(), 'load');
  assert.deepStrictEqual({ loadTime: load.loadTime, error: load.error }, { loadTime: null, error: 'the timing came from another document' });
});

test('a timing read keeps its visit through a hash jump or replaceState', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage({ evaluate: async () => ({ documentUrl: 'https://example.com/#top', ...TIMING }) }));
  await navigate(page, 'https://example.com/');

  assert.strictEqual(ofType(box.entries(), 'load')[0].loadTime, 1200);
});

test('a second load event for a visit is recorded once', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('load', page);
  await settle();

  assert.strictEqual(ofType(box.entries(), 'load').length, 1);
});

test("a popup's earlier console, errors, failed requests and status come from its history, each once", async (t) => {
  const box = sandbox(t);
  let finish;
  const history = new Promise((resolve) => { finish = resolve; });
  const redirect = request('https://example.com/old-popup/', { navigation: true });
  const page = fakePage({
    url: 'https://example.com/popup/',
    history: {
      consoleMessages: () => history.then(() => [message('error', 'before'), message('warning', 'deprecated'), message('log', 'chatter'), message('error', 'during')]),
      pageErrors: () => history.then(() => [new Error('Uncaught early')]),
      requests: () => history.then(() => requests),
    },
  });
  const live404 = request('https://example.com/late.png', { frame: page.main, type: 'image', existing: response(null, 404) });
  const requests = [
    { ...request('https://example.com/popup/', { navigation: true, frame: page.main, from: redirect, existing: response(null, 200) }) },
    request('https://example.com/early.png', { frame: page.main, type: 'image', existing: response(null, 404) }),
    request('https://example.com/ok.css', { frame: page.main, type: 'stylesheet', existing: response(null, 200) }),
    live404,
  ];
  redirect.frame = () => page.main;
  await start(page);
  page.emit('console', message('error', 'during'));
  page.emit('console', message('error', 'after the history was asked for'));
  page.emit('response', response(live404, 404));
  finish();
  await settle();
  await settle();

  const entries = box.entries();
  const [visit] = ofType(entries, 'visit');
  assert.deepStrictEqual({ url: visit.url, status: visit.status, redirectedFrom: visit.redirectedFrom, caughtUp: visit.caughtUp }, { url: 'https://example.com/popup/', status: 200, redirectedFrom: ['https://example.com/old-popup/'], caughtUp: true });
  assert.deepStrictEqual(ofType(entries, 'console').map((row) => row.text).sort(), ['Uncaught early', 'after the history was asked for', 'before', 'deprecated', 'during'].sort());
  assert.deepStrictEqual(ofType(entries, 'network').map((row) => row.url).sort(), ['https://example.com/early.png', 'https://example.com/late.png']);
});

test("a popup whose history can't be read still gets its visit and its live messages", async (t) => {
  const box = sandbox(t);
  const page = fakePage({ url: 'https://example.com/popup/' });
  const broken = { ...request('https://example.com/popup/', { navigation: true, frame: page.main }), existingResponse: () => { throw new Error('gone'); } };
  Object.assign(page, { consoleMessages: async () => { throw new Error('no history'); }, requests: async () => [broken] });
  await start(page);
  page.emit('console', message('error', 'live'));

  const entries = box.entries();
  assert.deepStrictEqual(ofType(entries, 'visit').map((visit) => [visit.url, visit.status]), [['https://example.com/popup/', null]]);
  assert.deepStrictEqual(ofType(entries, 'console').map((row) => row.text), ['live']);
});

test('a popup that loaded before the capture started is caught up once', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage({ url: 'https://example.com/popup/', evaluate: async (fn) => (String(fn).includes('readyState') ? 'complete' : TIMING) }));
  page.emit('load', page);
  await settle();

  const entries = box.entries();
  assert.deepStrictEqual(ofType(entries, 'visit').map((visit) => [visit.url, visit.caughtUp]), [['https://example.com/popup/', true]]);
  assert.strictEqual(ofType(entries, 'load').length, 1);
});

test('a page that is not a web page is not a visit', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  for (const url of ['about:blank', 'chrome-error://chromewebdata/', 'data:text/html,hi']) {
    page.emit('request', request(url, { navigation: true, frame: page.main }));
    page.emit('framenavigated', page.main);
  }

  assert.deepStrictEqual(box.entries(), []);
});

test('only failed requests are recorded, as url, status, type and failure', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  for (const [url, status, type] of [['https://example.com/a.css', 200, 'stylesheet'], ['https://example.com/b', 301, 'document'], ['https://example.com/c.js', 304, 'script'], ['https://example.com/d.png', 404, 'image'], ['https://example.com/api', 500, 'fetch']]) {
    page.emit('response', response(request(url, { frame: page.main, type }), status));
  }
  page.emit('requestfailed', request('http://example.com/e.js', { frame: page.main, type: 'script', failure: 'net::ERR_BLOCKED_BY_CLIENT' }));

  const rows = ofType(box.entries(), 'network');
  assert.deepStrictEqual(rows.map((row) => [row.url, row.status]), [['https://example.com/d.png', 404], ['https://example.com/api', 500], ['http://example.com/e.js', null]]);
  assert.deepStrictEqual(Object.keys(rows[0]).sort(), ['at', 'resourceType', 'status', 'type', 'url', 'visit']);
  assert.deepStrictEqual(Object.keys(rows[2]).sort(), ['at', 'failure', 'resourceType', 'status', 'type', 'url', 'visit']);
});

test('a long request url is clipped', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('response', response(request(`https://example.com/?q=${'z'.repeat(3000)}`, { frame: page.main }), 404));
  page.emit('requestfailed', request(`https://example.com/?q=${'z'.repeat(3000)}`, { frame: page.main, failure: 'f'.repeat(2000) }));

  const rows = ofType(box.entries(), 'network');
  assert.deepStrictEqual(rows.map((row) => row.url.length), [1001, 1001]);
  assert.strictEqual(rows[1].failure.length, 501);
});

test('a service worker request without a frame is still recorded', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  const worker = { ...request('https://example.com/sw-asset.js', { type: 'script' }), frame: () => { throw new Error('Service Worker requests do not have an associated frame.'); } };
  page.emit('response', response(worker, 404));

  assert.deepStrictEqual(ofType(box.entries(), 'network').map((row) => row.url), ['https://example.com/sw-asset.js']);
});

test('console keeps errors, warnings and page errors, clipped', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  for (const type of ['log', 'info', 'debug', 'error', 'warning']) page.emit('console', message(type, type));
  page.emit('console', message('error', 'x'.repeat(2000), `https://example.com/${'y'.repeat(2000)}.js`));
  page.emit('pageerror', new Error('Uncaught TypeError'));

  const rows = ofType(box.entries(), 'console');
  assert.deepStrictEqual(rows.map((row) => row.level), ['error', 'warning', 'error', 'pageerror']);
  assert.strictEqual(rows[2].text, `${'x'.repeat(500)}…`);
  assert.strictEqual(rows[2].source.length, 1001);
});

test('a visit stops recording at 200 rows, with one marker', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  for (let i = 0; i < 250; i += 1) page.emit('console', message('error', `loop ${i}`));

  const entries = box.entries();
  assert.strictEqual(ofType(entries, 'console').length, 200);
  assert.deepStrictEqual(ofType(entries, 'truncated').map(({ visit, reason }) => [visit, reason]), [[entries[0].visit, 'rows']]);
});

test('the file stops growing past 10 MB, with one marker', async (t) => {
  const box = sandbox(t);
  fs.mkdirSync(path.dirname(box.file), { recursive: true });
  fs.writeFileSync(box.file, `${'x'.repeat(10 * 1024 * 1024)}\n`);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('console', message('error', 'one more'));

  const tail = fs.readFileSync(box.file, 'utf8').slice(10 * 1024 * 1024 + 1).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepStrictEqual(tail.map(({ type, reason }) => [type, reason]), [['truncated', 'file']]);
});

test('site text cannot add lines or change where the capture writes', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('console', message('error', '\n{"type":"visit","visit":"forged","url":"https://example.com/forged/"}\n', '../../../../tmp/escape.jsonl'));
  page.emit('response', response(request('https://example.com/../../x\n{"type":"visit"}', { frame: page.main }), 404));

  assert.deepStrictEqual(ofType(box.entries(), 'visit').map((visit) => visit.url), ['https://example.com/']);
  assert.deepStrictEqual(fs.readdirSync(box.reportsDir, { recursive: true }).sort(), ['data', path.join('data', 'capture-test-session.jsonl')]);
});

test('a broken page or an unwritable folder never throws out of the capture', async (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.reportsDir, 'data'), 'a file where the folder should be');
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  t.after(() => process.off('unhandledRejection', onRejection));
  const boom = () => { throw new Error('boom'); };

  const page = await start(fakePage({ url: 'https://example.com/', evaluate: async () => boom() }));
  page.viewportSize = boom;
  assert.doesNotThrow(() => {
    page.emit('request', { isNavigationRequest: boom, url: boom });
    page.emit('framenavigated', page.main);
    page.emit('load', page);
    page.emit('console', { type: boom });
    page.emit('pageerror', null);
    page.emit('response', { request: boom });
    page.emit('requestfailed', { failure: boom });
  });
  await settle();
  await assert.doesNotReject(capture.default({ page: { url: boom } }));
  await settle();
  assert.deepStrictEqual(rejections, []);
});

// Playwright serializes readTiming and runs it in the page, so the test runs its source the same way.
const runInPage = async (globals) => JSON.parse(JSON.stringify(await vm.runInNewContext(`(${capture.readTiming})()`, { setTimeout, Date, ...globals })));

test('the timing read takes the viewport and the document from the page', async () => {
  const nav = { name: 'https://example.com/', loadEventEnd: 812.4, domContentLoadedEventEnd: 401.6, responseStart: 98.2, transferSize: 3100, type: 'reload' };
  const entries = { navigation: [nav], resource: [{ transferSize: 1000 }, { transferSize: 0 }, {}] };
  const timing = await runInPage({ innerWidth: 756, innerHeight: 469, performance: { getEntriesByType: (type) => entries[type] } });

  assert.deepStrictEqual(timing, { documentUrl: 'https://example.com/', viewport: { width: 756, height: 469 }, loadTime: 812, domContentLoaded: 402, ttfb: 98, transferSize: 3100, resourceTransferSize: 1000, navType: 'reload' });
});

test('the timing read gives up on a page that never finishes loading', async () => {
  const realNow = Date.now;
  let now = 0;
  const timing = await runInPage({ Date: { now: () => (now += 500) }, innerWidth: 375, innerHeight: 812, performance: { getEntriesByType: () => [{ name: 'https://example.com/', loadEventEnd: 0 }] } });

  assert.strictEqual(Date.now, realNow);
  assert.deepStrictEqual(timing, { documentUrl: 'https://example.com/', viewport: { width: 375, height: 812 }, loadTime: null });
});

test('the capture file is per session, and a strange session id stays in reports/data', () => {
  const env = { KOSH_REPORTS_DIR: '/tmp/kosh-reports' };
  assert.strictEqual(capture.captureFile({ ...env, CLAUDE_CODE_SESSION_ID: '0b3f6c2e-5d1a-4e7b' }), '/tmp/kosh-reports/data/capture-0b3f6c2e-5d1a-4e7b.jsonl');
  for (const session of [undefined, '', '../../etc/x', 'a/b', 'a b']) {
    assert.strictEqual(capture.captureFile({ ...env, CLAUDE_CODE_SESSION_ID: session }), '/tmp/kosh-reports/data/capture.jsonl');
  }
  assert.strictEqual(capture.captureFile({}), path.join(__dirname, '../reports/data/capture.jsonl'));
});
