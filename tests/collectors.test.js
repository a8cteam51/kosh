const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '../collectors/kosh.js'), 'utf8');

// A page at `url` with kosh.js evaluated in it, as --init-script does.
const page = (url, { bodyClass = '', title = 'Example Site' } = {}) => {
  const { window } = new JSDOM(`<!doctype html><title>${title}</title><body class="${bodyClass}"></body>`, { url, runScripts: 'outside-only' });
  window.eval(SOURCE);
  return window;
};

const gate = (requested, landed = requested, markup = {}) => page(landed, markup).__kosh.gate(requested);

for (const [name, landed, markup, expected] of [
  ['an ungated page', 'https://example.com/', {}, null],
  ['coming soon', 'https://example.com/', { bodyClass: 'home wpcom-coming-soon-body' }, 'coming-soon'],
  ['a password prompt, by class', 'https://example.com/', { bodyClass: 'login login-password-protected' }, 'password-protected'],
  ['a password prompt, by url', 'https://example.com/wp-login.php?password-protected=login', {}, 'password-protected'],
  ['a private site, by class', 'https://example.com/', { bodyClass: 'private-login' }, 'private'],
  ['a private site, by title', 'https://example.com/', { title: 'Private Site' }, 'private'],
  ['a title that only starts with Private Site', 'https://example.com/', { title: 'Private Site Tours' }, null],
]) {
  test(`gate: ${name}`, () => {
    assert.deepStrictEqual({ ...gate('https://example.com/', landed, markup) }, { gate: expected, redirectedTo: null });
  });
}

for (const [name, requested, landed] of [
  ['another path', 'https://example.com/', 'https://example.com/en/'],
  ['http to https', 'http://example.com', 'https://example.com/'],
  ['apex to www', 'https://example.com/', 'https://www.example.com/'],
  ['www to apex', 'https://www.example.com/', 'https://example.com/'],
]) {
  test(`gate: ${name} is not a redirect`, () => {
    assert.strictEqual(gate(requested, landed).redirectedTo, null);
  });
}

for (const [name, requested, landed] of [
  ['another domain', 'https://example.com/', 'https://example.org/shop/'],
  ['another subdomain', 'https://shop.example.com/', 'https://example.com/'],
  ['another port', 'http://localhost:8080/', 'http://localhost:8081/'],
]) {
  test(`gate: ${name} is a redirect`, () => {
    assert.strictEqual(gate(requested, landed).redirectedTo, landed);
  });
}

test('gate: a gate on another host reports the gate, not the redirect', () => {
  assert.deepStrictEqual({ ...gate('https://example.com/', 'https://example.org/log-in', { bodyClass: 'private-login' }) }, { gate: 'private', redirectedTo: null });
});

test('gate: a requested url that is not a url throws', () => {
  assert.throws(() => gate('<the URL you were asked to test>', 'https://example.com/'), /Invalid URL/);
});

// The browser on the sitemap, as the AEO skill leaves it, with fetch answering `html` from `landed` (the url after any redirect).
const HOME = 'https://example.com/';
const staticHtml = async (html, { url = HOME, landed = HOME, status = 200, type = 'text/html; charset=utf-8', fails = false } = {}) => {
  const window = page('https://example.com/sitemap.xml');
  const fetched = [];
  window.fetch = async (requested) => {
    fetched.push(String(requested));
    if (fails) throw new TypeError('Failed to fetch');
    const headers = { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) };
    return { ok: status >= 200 && status < 300, status, url: landed, headers, text: async () => html };
  };
  return { result: { ...(await window.__kosh.staticHtml(url)) }, fetched };
};

const BODY_COPY = `<p>${'Static body copy. '.repeat(40)}</p>`;

test('staticHtml: reads the url it is given, not the page the browser is on', async () => {
  const { result, fetched } = await staticHtml(`<!doctype html><body><h1> Example  Site </h1>${BODY_COPY}</body>`);
  assert.deepStrictEqual(fetched, [HOME]);
  assert.deepStrictEqual({ ...result, bodyTextLength: result.bodyTextLength > 500 }, { url: HOME, status: 200, h1Present: true, h1Text: 'Example Site', bodyTextLength: true });
});

test('staticHtml: reports the url it read after a redirect', async () => {
  const { result } = await staticHtml('<!doctype html><body><h1>Example Site</h1></body>', { landed: 'https://www.example.com/' });
  assert.strictEqual(result.url, 'https://www.example.com/');
});

test('staticHtml: content a script builds is not there', async () => {
  const { result } = await staticHtml('<!doctype html><body><div id="root"></div><script>document.getElementById("root").innerHTML = "<h1>Built by JavaScript</h1>"</script></body>');
  assert.deepStrictEqual(result, { url: HOME, status: 200, h1Present: false, h1Text: null, bodyTextLength: 0 });
});

test('staticHtml: noscript content counts, as it shows with JavaScript off', async () => {
  const { result } = await staticHtml('<!doctype html><body><noscript><h1>Please enable JavaScript</h1></noscript></body>');
  assert.deepStrictEqual(result, { url: HOME, status: 200, h1Present: true, h1Text: 'Please enable JavaScript', bodyTextLength: 'Please enable JavaScript'.length });
});

test('staticHtml: style and template text is not body copy', async () => {
  const { result } = await staticHtml('<!doctype html><body><style>h1 { color: red }</style><template><p>Later</p></template><p>Visible</p></body>');
  assert.strictEqual(result.bodyTextLength, 'Visible'.length);
});

test('staticHtml: an error page is an error, not the homepage', async () => {
  const { result } = await staticHtml('<!doctype html><body><h1>Access denied</h1></body>', { status: 403 });
  assert.deepStrictEqual(result, { url: HOME, status: 403, error: 'HTTP 403' });
});

test('staticHtml: a page that is not HTML is an error, not a homepage with no H1', async () => {
  const { result } = await staticHtml('<?xml version="1.0"?><urlset></urlset>', { url: 'https://example.com/sitemap.xml', landed: 'https://example.com/sitemap.xml', type: 'application/xml' });
  assert.deepStrictEqual(result, { url: 'https://example.com/sitemap.xml', status: 200, error: 'not HTML: application/xml' });
});

test('staticHtml: a response with no content type is not read as HTML', async () => {
  const { result } = await staticHtml('<h1>Example Site</h1>', { type: null });
  assert.strictEqual(result.error, 'not HTML: no content type');
});

test('staticHtml: a fetch that fails returns the error, not a result', async () => {
  const { result } = await staticHtml('', { fails: true });
  assert.deepStrictEqual(result, { error: 'TypeError: Failed to fetch' });
});

test('staticHtml: no url returns an error rather than fetching the wrong page', async () => {
  const window = page('https://example.com/sitemap.xml');
  let fetched = false;
  window.fetch = async () => { fetched = true; };
  assert.match((await window.__kosh.staticHtml()).error, /Invalid URL/);
  assert.strictEqual(fetched, false);
});

// An Image that loads `sizes[url]` after a tick, or fails for a url it doesn't know, like a browser's.
const imageSize = async (url, sizes, { never = false } = {}) => {
  const window = page('https://example.com/blog/');
  const requested = [];
  window.Image = class {
    set src(value) {
      requested.push(value);
      if (never) return;
      setTimeout(() => {
        if (!sizes[value]) return this.onerror?.();
        [this.naturalWidth, this.naturalHeight] = sizes[value];
        this.onload?.();
      });
    }
  };
  return { result: { ...(await window.__kosh.imageSize(url)) }, requested };
};

test('imageSize: an image on another host gives its real pixels, and only them', async () => {
  const url = 'https://i0.wp.com/example.com/wp-content/uploads/hero.jpg';
  assert.deepStrictEqual(await imageSize(url, { [url]: [2400, 1600] }), { result: { width: 2400, height: 1600 }, requested: [url] });
});

test('imageSize: a relative url is read against the page', async () => {
  const { requested } = await imageSize('/wp-content/uploads/hero.jpg', { 'https://example.com/wp-content/uploads/hero.jpg': [800, 600] });
  assert.deepStrictEqual(requested, ['https://example.com/wp-content/uploads/hero.jpg']);
});

test('imageSize: something that is not an image, or not a url, is an error, not a size', async () => {
  assert.deepStrictEqual((await imageSize('https://example.com/about/', {})).result, { error: 'not loaded as an image' });
  const notUrl = await imageSize('http://[', {});
  assert.match(notUrl.result.error, /Invalid URL/);
  assert.deepStrictEqual(notUrl.requested, []);
});

test('imageSize: an image that never loads times out instead of hanging the call', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = imageSize('https://example.com/slow.jpg', {}, { never: true });
  t.mock.timers.tick(10000);
  assert.deepStrictEqual((await pending).result, { error: 'timed out' });
});

// A color-contrast node as axe reports it: one selector per frame, an array of them for an element in a shadow root.
const axeNode = (target, data, html = '<p>text</p>') => ({ target, html, any: [{ id: 'color-contrast', data }], all: [], none: [] });
const withAxe = (results) => {
  const window = page('https://example.com/');
  const calls = [];
  window.axe = { run: async (context, options) => (calls.push(options), { violations: [], incomplete: [], ...results }) };
  return { window, calls };
};

test("contrast: runs only axe's color-contrast rule and returns each node's measurement", async () => {
  const { window, calls } = withAxe({
    violations: [{ id: 'color-contrast', nodes: [
      axeNode(['footer > p'], { fgColor: '#c8c8c8', bgColor: '#ffffff', contrastRatio: 1.67, fontSize: '12.0pt (16px)', fontWeight: 'normal', expectedContrastRatio: '4.5:1' }),
      axeNode([['#host', 'p']], { contrastRatio: 1.6, expectedContrastRatio: '4.5:1' }),
    ] }],
    incomplete: [{ id: 'color-contrast', nodes: [axeNode(['.wp-block-cover h2'], { fgColor: '#ffffff', contrastRatio: 0, expectedContrastRatio: '3:1', messageKey: 'imgNode' })] }],
  });
  const { violations, incomplete, counts } = await window.__kosh.contrast();
  assert.deepStrictEqual(calls.map((options) => [...options.runOnly.values]), [['color-contrast']]);
  assert.deepStrictEqual({ ...violations[0] }, { selector: 'footer > p', html: '<p>text</p>', ratio: 1.67, threshold: 4.5, textColor: '#c8c8c8', background: '#ffffff', fontSize: '12.0pt (16px)', fontWeight: 'normal', reason: null });
  assert.strictEqual(violations[1].selector, '#host >>> p');
  assert.deepStrictEqual([incomplete[0].selector, incomplete[0].ratio, incomplete[0].threshold, incomplete[0].background, incomplete[0].reason], ['.wp-block-cover h2', null, 3, null, 'imgNode']);
  assert.deepStrictEqual({ ...counts }, { violations: 2, incomplete: 1 });
});

test('contrast: keeps the first 50 nodes of each list, clips their markup and counts them all', async () => {
  const many = Array.from({ length: 60 }, (_, i) => axeNode([`p:nth-child(${i + 1})`], { contrastRatio: 2, expectedContrastRatio: '4.5:1' }, `<p>${'x'.repeat(300)}</p>`));
  const { window } = withAxe({ violations: [{ id: 'color-contrast', nodes: many }] });
  const { violations, counts } = await window.__kosh.contrast();
  assert.strictEqual(violations.length, 50);
  assert.strictEqual(violations[0].html.length, 151);
  assert.strictEqual(counts.violations, 60);
});

test("__kosh's async functions: an unawaited one says to await it, and an awaited one is just its result", async () => {
  const { window } = withAxe({});
  for (const [name, call] of [['staticHtml', (kosh) => kosh.staticHtml('http://[')], ['imageSize', (kosh) => kosh.imageSize('http://[')], ['contrast', (kosh) => kosh.contrast()]]) {
    const pending = call(window.__kosh);
    assert.deepStrictEqual(Object.keys(pending), ['notAwaited'], name);
    assert.match(pending.notAwaited, new RegExp(`await __kosh\\.${name}\\(`), name);
    assert.ok(!('notAwaited' in Object(await pending)), name);
  }
});

test('contrast: an unawaited rejection is marked handled, and an await still gets it', async () => {
  const window = page('https://example.com/');
  window.axe = { run: async () => { throw new Error('Axe is already running'); } };
  const unhandled = [];
  const listen = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', listen);
  window.__kosh.contrast();
  await new Promise((resolve) => setTimeout(resolve, 20));
  process.off('unhandledRejection', listen);
  assert.deepStrictEqual(unhandled, []);
  await assert.rejects(window.__kosh.contrast(), /Axe is already running/);
});

test('contrast: says so when axe-core was not loaded into the page', async () => {
  assert.match(await page('https://example.com/').__kosh.contrast(), /axe-core is not loaded/);
});

test('a page cannot replace __kosh or its functions', () => {
  const window = page('https://example.com/');
  const original = window.__kosh.gate;

  window.eval('window.__kosh = {}; __kosh.gate = () => ({ gate: null, redirectedTo: null });');
  assert.throws(() => window.eval('Object.defineProperty(window, "__kosh", { value: {} })'), /redefine/);
  assert.strictEqual(window.__kosh.gate, original);
});
