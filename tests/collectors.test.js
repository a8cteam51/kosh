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
const staticHtml = async (html, { url = HOME, landed = HOME, status = 200, fails = false } = {}) => {
  const window = page('https://example.com/sitemap.xml');
  const fetched = [];
  window.fetch = async (requested) => {
    fetched.push(String(requested));
    if (fails) throw new TypeError('Failed to fetch');
    return { ok: status >= 200 && status < 300, status, url: landed, text: async () => html };
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

test('a page cannot replace __kosh or its functions', () => {
  const window = page('https://example.com/');
  const original = window.__kosh.gate;

  window.eval('window.__kosh = {}; __kosh.gate = () => ({ gate: null, redirectedTo: null });');
  assert.throws(() => window.eval('Object.defineProperty(window, "__kosh", { value: {} })'), /redefine/);
  assert.strictEqual(window.__kosh.gate, original);
});
