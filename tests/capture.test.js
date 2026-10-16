const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const capture = require('../collectors/capture.js');

const TIMING = { viewport: { width: 1920, height: 1080 }, loadTime: 1200, domContentLoaded: 800, ttfb: 100, transferSize: 5000, resourceTransferSize: 90000, navType: 'navigate' };
const VITALS = { lcp: 900, cls: 0.02, quietFor: 1000, sinceLoad: 10000 };
// Answers each read the capture makes, the way the page would: readyState, the vitals, or the timing.
const answer = (fn, timing, vitals = VITALS) => {
  if (String(fn).includes('readyState')) return 'loading';
  return String(fn).includes('layout-shift') ? vitals : timing;
};

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
    evaluate: evaluate || (async (fn) => answer(fn, { documentUrl: at, ...TIMING })),
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

  const [visit, load, vitals] = box.entries();
  assert.deepStrictEqual({ ...visit, at: undefined }, { at: undefined, type: 'visit', visit: visit.visit, url: 'https://example.com/', status: 200, redirectedFrom: [] });
  assert.deepStrictEqual({ ...load, at: undefined }, { at: undefined, type: 'load', visit: visit.visit, ...TIMING });
  assert.deepStrictEqual({ ...vitals, at: undefined }, { at: undefined, type: 'vitals', visit: visit.visit, lcp: 900, cls: 0.02, settled: true });
});

test('the vitals are read until the visit ends, with a line for each change and none from the next document', async (t) => {
  const box = sandbox(t);
  const read = (lcp, cls, quietFor, timeOrigin = 1) => ({ timeOrigin, lcp, cls, quietFor, sinceLoad: 100 });
  const reads = [read(300, 0, 10), read(300, 0, 1500), read(300, 0, 2000), read(300, 0.12, 10), read(50, 0, 10, 2)];
  const page = await start(fakePage({ evaluate: async (fn) => (String(fn).includes('layout-shift') ? reads.shift() : answer(fn, { documentUrl: 'https://example.com/', timeOrigin: 1, ...TIMING })) }));
  await navigate(page, 'https://example.com/');
  for (let wait = 0; reads.length && wait < 40; wait += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  await settle();

  assert.deepStrictEqual(ofType(box.entries(), 'vitals').map(({ lcp, cls, settled }) => [lcp, cls, settled]), [[300, 0, false], [300, 0, true], [300, 0.12, false]]);
});

test('the vitals are read no later than ten seconds after load', async (t) => {
  const box = sandbox(t);
  let reads = 0;
  const page = await start(fakePage({ evaluate: async (fn) => (String(fn).includes('layout-shift') ? (reads += 1, { lcp: 1, cls: 0, quietFor: 0, sinceLoad: 10000 }) : answer(fn, { documentUrl: 'https://example.com/', ...TIMING })) }));
  await navigate(page, 'https://example.com/');
  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.strictEqual(reads, 1);
  assert.strictEqual(ofType(box.entries(), 'vitals').length, 1);
});

test('a page that never settles stops being read, however its clock runs', async (t) => {
  const box = sandbox(t);
  const realNow = Date.now;
  let now = 0;
  Date.now = () => (now += 6000);
  t.after(() => { Date.now = realNow; });
  const page = await start(fakePage({ evaluate: async (fn) => answer(fn, { documentUrl: 'https://example.com/', ...TIMING }, { lcp: 1, cls: 0, quietFor: 0, sinceLoad: 0 }) }));
  await navigate(page, 'https://example.com/');
  await new Promise((resolve) => setTimeout(resolve, 800));
  Date.now = realNow;

  assert.deepStrictEqual(ofType(box.entries(), 'vitals').map(({ settled }) => settled), [false]);
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

test('only the first redirect step, on the site, keeps its page query, so a login token is never written', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/', { redirects: [['https://www.example.com/?p=5&token=secret', 301], ['https://login.example.net/remote-login.php?token=secret&back=x', 302], ['https://example.com/?remote_login=validate&token=secret', 302]] });
  await navigate(page, 'https://example.com/b/', { redirects: [['https://login.example.net/magic?token=secret', 302]] });

  assert.deepStrictEqual(ofType(box.entries(), 'visit').map((visit) => visit.redirectedFrom), [
    ['https://www.example.com/?p=5', 'https://login.example.net/remote-login.php', 'https://example.com/'],
    ['https://login.example.net/magic'],
  ]);
  assert.doesNotMatch(fs.readFileSync(box.file, 'utf8'), /secret/);
});

test("a visit's url drops parameters named like credentials or holding an email address, on any host, and keeps the rest", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  const urls = {
    'https://wordpress.com/log-in/link/use?client_id=1&email=someone%40example.com&token=secret': 'https://wordpress.com/log-in/link/use?client_id=1',
    'https://example.com/?share=secret': 'https://example.com/',
    'https://example.com/?p=5&preview=true&preview_nonce=secret': 'https://example.com/?p=5&preview=true',
    'https://example.com/?page_id=3&accessToken=secret&ref=someone@example.com': 'https://example.com/?page_id=3',
    'https://example.com/?product=blue-shirt&lang=fr': 'https://example.com/?product=blue-shirt&lang=fr',
    'https://example.com/?author=2&s=two+words': 'https://example.com/?author=2&s=two+words',
  };
  for (const url of Object.keys(urls)) await navigate(page, url);

  assert.deepStrictEqual(ofType(box.entries(), 'visit').map((visit) => visit.url), Object.values(urls));
  assert.doesNotMatch(fs.readFileSync(box.file, 'utf8'), /secret|someone/);
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
  assert.deepStrictEqual(ofType(box.entries(), 'vitals'), []);
});

test('a timing read keeps its visit through a hash jump or replaceState', async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage({ evaluate: async (fn) => answer(fn, { documentUrl: 'https://example.com/#top', ...TIMING }) }));
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
  const page = await start(fakePage({ url: 'https://example.com/popup/', evaluate: async (fn) => (String(fn).includes('readyState') ? 'complete' : answer(fn, TIMING)) }));
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

test("a visit names its page's browser: one per context, so a tab or popup shares it and a new browser doesn't", async (t) => {
  const box = sandbox(t);
  const [first, second] = [{}, {}];
  for (const context of [first, first, second, null]) {
    const page = await start(Object.assign(fakePage(), { context: () => context ?? (() => { throw new Error('no context'); })() }));
    await navigate(page, 'https://example.com/');
  }

  const browsers = ofType(box.entries(), 'visit').map((visit) => visit.browser);
  assert.match(browsers[0], /^[0-9a-f]{6}-b\d+$/);
  assert.deepStrictEqual(browsers.map((browser) => browsers.indexOf(browser)), [0, 0, 2, 3]);
  assert.strictEqual(browsers[3], undefined);
});

// Chrome's initiator stack, innermost frame first.
const initiated = (url, frames) => ({ request: { url }, initiator: { type: 'script', stack: { callFrames: frames.map((frameUrl) => ({ url: frameUrl })) } } });
// The function browser_evaluate passes to page.evaluate, with the model's code as its argument.
const mcpEvaluate = async (expr) => {
  const value = eval(`(${expr})`);
  return typeof value === 'function' ? value() : value;
};

test("browser_evaluate's code is named for Chrome's initiator stack and keeps its value, and other evaluates pass through", async (t) => {
  sandbox(t);
  const seen = [];
  const page = await start(fakePage({ evaluate: async (fn, arg) => (seen.push(arg), typeof arg === 'string' ? fn(arg) : answer(fn, { documentUrl: 'about:blank', ...TIMING })) }));

  assert.strictEqual(await page.evaluate(mcpEvaluate, 'async () => 6 * 7'), 42);
  assert.strictEqual(await page.evaluate(mcpEvaluate, 'function () { return "a function"; }'), 'a function');
  assert.strictEqual(await page.evaluate(mcpEvaluate, '"an expression"'), 'an expression');
  assert.match(seen.at(-1), new RegExp(`//# sourceURL=${capture.EVALUATE_URL}`));
  await page.evaluate(capture.readTiming);
  assert.strictEqual(seen.at(-1), undefined);
  await page.evaluate((text) => text, 'data from browser_run_code_unsafe');
  assert.strictEqual(seen.at(-1), 'data from browser_run_code_unsafe');
});

test("the model's own requests and their console errors are tagged, until the next visit, and a site request from Playwright's own URL-less select isn't", async (t) => {
  const box = sandbox(t);
  const cdp = Object.assign(new EventEmitter(), { send: async () => {} });
  const page = await start(Object.assign(fakePage(), { context: () => ({ newCDPSession: async () => cdp }) }));
  await navigate(page, 'https://example.com/');
  cdp.emit('Network.requestWillBeSent', initiated('https://example.com/sitemap.xml', ['https://example.com/wrap.js', capture.EVALUATE_URL, '']));
  cdp.emit('Network.requestWillBeSent', initiated('https://example.com/site.json', ['https://example.com/app.js']));
  cdp.emit('Network.requestWillBeSent', initiated('https://example.com/variation', ['https://example.com/app.js', '', '']));
  cdp.emit('Network.requestWillBeSent', { request: { url: 'https://example.com/logo.png' }, initiator: { type: 'parser' } });
  for (const url of ['https://example.com/sitemap.xml', 'https://example.com/site.json', 'https://example.com/variation', 'https://example.com/logo.png']) {
    page.emit('response', response(request(url, { frame: page.main, type: 'fetch' }), 404));
    page.emit('console', message('error', 'Failed to load resource: the server responded with a status of 404 ()', url));
  }
  page.emit('console', message('error', 'TypeError: x is undefined', 'https://example.com/sitemap.xml'));
  await navigate(page, 'https://example.com/about/');
  page.emit('response', response(request('https://example.com/sitemap.xml', { frame: page.main, type: 'fetch' }), 404));

  const rows = box.entries().filter((entry) => ['network', 'console'].includes(entry.type));
  assert.deepStrictEqual(rows.map((row) => [row.type, (row.url ?? row.source).replace('https://example.com', ''), row.byModel ?? false]), [
    ['network', '/sitemap.xml', true],
    ['console', '/sitemap.xml', true],
    ['network', '/site.json', false],
    ['console', '/site.json', false],
    ['network', '/variation', false],
    ['console', '/variation', false],
    ['network', '/logo.png', false],
    ['console', '/logo.png', false],
    ['console', '/sitemap.xml', false],
    ['network', '/sitemap.xml', false],
  ]);
});

test("a console call from browser_evaluate's code is the model's, and the site's own messages aren't", async (t) => {
  const box = sandbox(t);
  const page = await start(fakePage());
  await navigate(page, 'https://example.com/');
  page.emit('console', message('error', 'model error', capture.EVALUATE_URL));
  page.emit('console', message('warning', 'site warning', 'https://example.com/app.js'));
  page.emit('console', message('error', 'inline site error', ''));

  assert.deepStrictEqual(ofType(box.entries(), 'console').map((row) => [row.text, row.byModel ?? false]), [['model error', true], ['site warning', false], ['inline site error', false]]);
});

test("a failed request's url and a console source drop credentials too, while the model's tag still matches the url it was sent with", async (t) => {
  const box = sandbox(t);
  const cdp = Object.assign(new EventEmitter(), { send: async () => {} });
  const page = await start(Object.assign(fakePage(), { context: () => ({ newCDPSession: async () => cdp }) }));
  await navigate(page, 'https://example.com/');
  const site = 'https://example.com/wp-json/wp/v2/x?_wpnonce=secret&a=1';
  const model = 'https://example.com/wp-json/wp/v2/pages?access_token=secret';
  cdp.emit('Network.requestWillBeSent', initiated(model, [capture.EVALUATE_URL]));
  for (const url of [site, model]) {
    page.emit('response', response(request(url, { frame: page.main, type: 'fetch' }), 403));
    page.emit('console', message('error', 'Failed to load resource: the server responded with a status of 403 ()', url));
  }

  const rows = box.entries().filter((entry) => ['network', 'console'].includes(entry.type));
  assert.deepStrictEqual(rows.map((row) => [row.url ?? row.source, row.byModel ?? false]), [
    ['https://example.com/wp-json/wp/v2/x?a=1', false],
    ['https://example.com/wp-json/wp/v2/x?a=1', false],
    ['https://example.com/wp-json/wp/v2/pages', true],
    ['https://example.com/wp-json/wp/v2/pages', true],
  ]);
  assert.doesNotMatch(fs.readFileSync(box.file, 'utf8'), /secret/);
});

test('the url filter drops credential names and email values, keeps every other parameter byte for byte, and drops the fragment', () => {
  const cases = {
    'https://example.com/?country_code=US&sort_key=price&promo_code=X': 'https://example.com/?country_code=US&sort_key=price&promo_code=X',
    'https://example.com/?secret_key=a&access_key=b&private_key=c&auth_key=d&license_key=e&page=2': 'https://example.com/?page=2',
    'https://example.com/?_wpnonce=a&apikey=b&PHPSESSID=c&csrf_token=d&X-Amz-Signature=e&share=f&code=g': 'https://example.com/',
    'https://example.com/?s=a%20b,c&token=x': 'https://example.com/?s=a%20b,c',
    'https://example.com/?ref=someone%40example.com&author=2': 'https://example.com/?author=2',
    'https://example.com/?p=1#access_token=secret': 'https://example.com/?p=1',
    'not a url': '',
  };
  for (const [url, expected] of Object.entries(cases)) assert.strictEqual(capture.redactUrl(url), expected, url);
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

test("the timing read records the gate check's answer, and nothing on a page that isn't gated", async () => {
  const nav = { name: 'https://example.com/', loadEventEnd: 900, domContentLoadedEventEnd: 400, responseStart: 90, transferSize: 3000, type: 'navigate' };
  const page = (gate) => ({ location: { href: nav.name }, __kosh: { gate: (url) => ({ gate: url === nav.name ? gate : 'wrong url' }) }, innerWidth: 1920, innerHeight: 1080, performance: { getEntriesByType: (type) => (type === 'navigation' ? [nav] : []) } });

  assert.equal((await runInPage(page('coming-soon'))).gate, 'coming-soon');
  assert.ok(!('gate' in await runInPage(page(null))));
});

test("the timing read records WordPress's logged-in body class, and nothing for a visitor or a body it can't read", async () => {
  const nav = { name: 'https://example.com/', loadEventEnd: 900, domContentLoadedEventEnd: 400, responseStart: 90, transferSize: 3000, type: 'navigate' };
  const page = (contains) => ({ document: contains && { body: { classList: { contains } } }, innerWidth: 1920, innerHeight: 1080, performance: { getEntriesByType: (type) => (type === 'navigation' ? [nav] : []) } });

  assert.equal((await runInPage(page((name) => name === 'logged-in'))).loggedIn, true);
  for (const contains of [() => false, () => 'yes', undefined]) assert.ok(!('loggedIn' in await runInPage(page(contains))));
});

test('the timing read gives up on a page that never finishes loading', async () => {
  const realNow = Date.now;
  let now = 0;
  const timing = await runInPage({ Date: { now: () => (now += 500) }, innerWidth: 375, innerHeight: 812, performance: { getEntriesByType: () => [{ name: 'https://example.com/', loadEventEnd: 0 }] } });

  assert.strictEqual(Date.now, realNow);
  assert.deepStrictEqual(timing, { documentUrl: 'https://example.com/', viewport: { width: 375, height: 812 }, loadTime: null });
});

// The page's observers, holding the entries a buffered observe would hand back.
const vitalsInPage = ({ paints = [], shifts = [], loadEventEnd = 1000, now = 3000 }) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${capture.readVitals})()`, {
  PerformanceObserver: class {
    observe({ type }) { this.entries = type === 'layout-shift' ? shifts : paints; }
    takeRecords() { return this.entries; }
    disconnect() {}
  },
  performance: { timeOrigin: 42, now: () => now, getEntriesByType: () => [{ loadEventEnd }] },
})));

test('LCP is the last candidate, and CLS the worst burst of shifts under 1 s apart and 5 s long, input aside', () => {
  const shift = (startTime, value, hadRecentInput = false) => ({ startTime, value, hadRecentInput });
  const vitals = vitalsInPage({
    paints: [{ startTime: 400.4 }, { startTime: 1250.6 }],
    shifts: [
      shift(100, 0.05), shift(900, 0.04),
      shift(2000, 0.5, true),
      shift(2100, 0.03), shift(3000, 0.03), shift(3900, 0.03), shift(4800, 0.03), shift(5700, 0.03), shift(6600, 0.03), shift(7500, 0.03),
    ],
    now: 8000,
  });

  assert.deepStrictEqual(vitals, { timeOrigin: 42, lcp: 1251, cls: 0.18, quietFor: 500, sinceLoad: 7000 });
});

test("a page that filled Chrome's 150-shift buffer is never quiet, however long ago its last kept shift was", () => {
  const shifts = (count) => Array.from({ length: count }, (_, i) => ({ startTime: 100 + i, value: 0.001, hadRecentInput: i % 2 === 0 }));

  assert.strictEqual(vitalsInPage({ shifts: shifts(149) }).quietFor, 2000);
  assert.strictEqual(vitalsInPage({ shifts: shifts(150) }).quietFor, 0);
});

test('a page with no candidate or shift has no LCP, a CLS of 0, and is quiet since its load', () => {
  assert.deepStrictEqual(vitalsInPage({}), { timeOrigin: 42, lcp: null, cls: 0, quietFor: 2000, sinceLoad: 2000 });
});

test('the capture file is per session, and a strange session id stays in reports/data', () => {
  const env = { KOSH_REPORTS_DIR: '/tmp/kosh-reports' };
  assert.strictEqual(capture.captureFile({ ...env, CLAUDE_CODE_SESSION_ID: '0b3f6c2e-5d1a-4e7b' }), '/tmp/kosh-reports/data/capture-0b3f6c2e-5d1a-4e7b.jsonl');
  for (const session of [undefined, '', '../../etc/x', 'a/b', 'a b']) {
    assert.strictEqual(capture.captureFile({ ...env, CLAUDE_CODE_SESSION_ID: session }), '/tmp/kosh-reports/data/capture.jsonl');
  }
  assert.strictEqual(capture.captureFile({}), path.join(__dirname, '../reports/data/capture.jsonl'));
});

test('the capture exposes no function a page can call', () => {
  assert.doesNotMatch(fs.readFileSync(require.resolve('../collectors/capture.js'), 'utf8'), /expose(Binding|Function)/);
});
