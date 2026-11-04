const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '../collectors/kosh.js'), 'utf8');

// jsdom has no innerText.
const withInnerText = (window) => Object.defineProperty(window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });

// A page at `url` with kosh.js evaluated in it, as --init-script does.
const page = (url, { bodyClass = '', title = 'Example Site' } = {}) => {
  const { window } = new JSDOM(`<!doctype html><title>${title}</title><body class="${bodyClass}"></body>`, { url, runScripts: 'outside-only' });
  window.eval(SOURCE);
  withInnerText(window);
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
    assert.ok(!pending.notAwaited.includes('…'), name);
    assert.ok(!('notAwaited' in Object(await pending)), name);
  }
  assert.match(window.__kosh.contrast().notAwaited, /`await __kosh\.contrast\(\)`/);
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

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js', { paths: [path.join(__dirname, '..')] }), 'utf8');

// jsdom has no layout, so real axe's color code runs over a stubbed stack and the computed styles a browser would give.
const plain = (value) => JSON.parse(JSON.stringify(value));
const withRealColors = (body, styles = {}, results = () => ({})) => {
  const { window } = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'https://example.com/', runScripts: 'outside-only' });
  window.eval(SOURCE);
  window.eval(AXE);
  withInnerText(window);
  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element, pseudo) => {
    const key = `${element.id}${pseudo ?? ''}`;
    const style = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', opacity: '1', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', visibility: 'visible', ...styles[key] };
    return new Proxy(computed(element), { get: (_, name) => (name === 'getPropertyValue' ? (prop) => (prop === '-webkit-text-fill-color' ? style.color : style[prop.replace(/-(\w)/g, (__, c) => c.toUpperCase())]) : style[name]) });
  };
  window.Element.prototype.getClientRects = () => [{}];
  window.axe.run = async (context, options) => { window.runOptions = options; return { violations: [], incomplete: [], ...results(window) }; };
  window.axe.setup = () => {};
  window.axe.teardown = () => { window.tornDown = (window.tornDown ?? 0) + 1; };
  const { commons } = window.axe;
  window.axe.commons = { ...commons, color: { ...commons.color, getBackgroundStack: (element) => [element, ...(window.stackBelow ?? [])] } };
  return window;
};
const gradientNode = (element) => ({ ...axeNode(['.hero'], { messageKey: 'bgGradient', expectedContrastRatio: '4.5:1' }), element });

for (const [name, image, color, range] of [
  ['fails at every stop', 'linear-gradient(90deg, rgb(119, 119, 119) 0%, rgb(136, 136, 136) 100%)', 'rgb(153, 153, 153)', { min: 1.24, max: 1.57 }],
  ['passes at every stop', 'linear-gradient(rgb(0, 0, 0), rgb(34, 34, 34))', 'rgb(255, 255, 255)', { min: 15.91, max: 21 }],
  ['translucent stops sit on what is behind them', 'linear-gradient(90deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.5))', 'rgb(255, 255, 255)', { min: 3.95, max: 17.58 }],
]) {
  test(`contrast: a gradient's ratio range when ${name}`, async () => {
    const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: image, color } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
    const [node] = plain(await window.__kosh.contrast()).incomplete;
    assert.deepStrictEqual(node.ratioRange, range);
    assert.strictEqual(node.ratio, null, 'axe gave no ratio, so none is invented');
    assert.match(node.textColor, /^#/);
    assert.strictEqual(window.tornDown, 1);
    assert.strictEqual(window.runOptions.elementRef, true, "axe's nodes need their element for this");
  });
}

test('contrast: the range samples between stops, where the text can vanish', async () => {
  // Gray text on a gradient from black to white matches its background partway, though both ends read well against it.
  const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))', color: 'rgb(128, 128, 128)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  const [node] = plain(await window.__kosh.contrast()).incomplete;
  assert.ok(node.ratioRange.min < 1.2, `min ${node.ratioRange.min}`);
});

test("contrast: a layer's opacity scales its stops", async () => {
  const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))', opacity: '0.5', color: 'rgb(0, 0, 0)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  const [node] = plain(await window.__kosh.contrast()).incomplete;
  assert.deepStrictEqual(node.ratioRange, { min: 5.32, max: 5.32 });
});

test('contrast: layered gradients all count, like a dot pattern over a radial', async () => {
  const dots = 'radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, rgba(0, 0, 0, 0) 1px), radial-gradient(63.21% 100% at 50% 100%, rgb(40, 27, 188) 0%, rgb(35, 25, 153) 100%)';
  const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: dots, color: 'rgb(255, 255, 255)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  const [node] = plain(await window.__kosh.contrast()).incomplete;
  assert.deepStrictEqual(node.ratioRange, { min: 9.68, max: 12.57 });
});

test('contrast: an opaque gradient hides any image beneath it, on the same element or further down the stack', async () => {
  const opaque = 'linear-gradient(rgb(0, 0, 0), rgb(34, 34, 34))';
  for (const [hero, below] of [[`${opaque}, url("x.png")`, 'none'], [opaque, 'url("x.png")']]) {
    const window = withRealColors('<div id="hero"></div><div id="below"></div>', { hero: { backgroundImage: hero.includes('url') ? opaque : hero, color: 'rgb(255, 255, 255)' }, below: { backgroundImage: below } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
    window.stackBelow = [window.document.getElementById('below')];
    const [node] = plain(await window.__kosh.contrast()).incomplete;
    assert.deepStrictEqual(node.ratioRange, { min: 15.91, max: 21 });
  }
});

test('contrast: an opaque background color under a translucent gradient hides any image further down', async () => {
  const window = withRealColors('<div id="hero"></div><div id="below"></div>', { hero: { backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5))', backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' }, below: { backgroundImage: 'url("x.png")' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  window.stackBelow = [window.document.getElementById('below')];
  assert.deepStrictEqual(plain(await window.__kosh.contrast()).incomplete[0].ratioRange, { min: 5.32, max: 5.32 });
});

test('contrast: a gradient whose stops can\'t be read gets no range', async () => {
  const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: 'linear-gradient(notacolor, alsonot)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  assert.ok(!('ratioRange' in plain(await window.__kosh.contrast()).incomplete[0]));
});

test('contrast: a translucent gradient over an image further down the stack gets no range', async () => {
  const window = withRealColors('<div id="hero"></div><div id="below"></div>', { hero: { backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.1))' }, below: { backgroundImage: 'url("x.png")' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
  window.stackBelow = [window.document.getElementById('below')];
  assert.ok(!('ratioRange' in plain(await window.__kosh.contrast()).incomplete[0]));
});

for (const [name, image] of [
  ['an image layer', 'linear-gradient(rgb(0, 0, 0), rgb(9, 9, 9)), url("x.png")'],
  ['more gradient layers than it will sample', Array(4).fill('linear-gradient(rgba(0, 0, 0, 0.1), rgba(9, 9, 9, 0.1))').join(', ')],
  ['an image alone', 'url("x.png")'],
]) {
  test(`contrast: no range, and axe's own result stands, for ${name}`, async () => {
    const window = withRealColors('<div id="hero"></div>', { hero: { backgroundImage: image } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('hero'))] }] }));
    const { incomplete } = await window.__kosh.contrast();
    assert.strictEqual(incomplete[0].reason, 'bgGradient');
    assert.ok(!('ratioRange' in incomplete[0]));
  });
}

test('contrast: gradient text keeps its transparency in textColor', async () => {
  const window = withRealColors('<div id="a"></div>', { a: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(9, 9, 9))', color: 'rgba(255, 255, 255, 0.5)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [gradientNode(w.document.getElementById('a'))] }] }));
  const { incomplete } = await window.__kosh.contrast();
  assert.strictEqual(incomplete[0].textColor, '#ffffff at 50%');
});

test('contrast: only bgGradient text gets a range, and clear text paint leaves it without one', async () => {
  const window = withRealColors('<div id="a"></div><div id="b"></div>', { a: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(9, 9, 9))' }, b: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(9, 9, 9))', color: 'rgba(0, 0, 0, 0)' } }, (w) => ({ incomplete: [{ id: 'color-contrast', nodes: [
    { ...axeNode(['#a'], { messageKey: 'bgImage' }), element: w.document.getElementById('a') },
    gradientNode(w.document.getElementById('b')),
  ] }] }));
  const { incomplete } = await window.__kosh.contrast();
  assert.deepStrictEqual(plain(incomplete).map((node) => 'ratioRange' in node), [false, false]);
});

test('contrast: a failing placeholder is a violation, a passing, disabled, filled or hidden one is left out', async () => {
  const window = withRealColors(`
    <input id="bad" placeholder="Email">
    <textarea id="area" placeholder="Message"></textarea>
    <input id="good" placeholder="Name">
    <input id="off" placeholder="Off" disabled>
    <input id="full" placeholder="Full" value="typed">
    <input id="blank" placeholder="  ">
    <input id="gone" placeholder="Gone">
  `, {
    'bad::placeholder': { color: 'rgb(204, 204, 204)' },
    'area::placeholder': { color: 'rgb(204, 204, 204)' },
    'good::placeholder': { color: 'rgb(51, 51, 51)' },
    'off::placeholder': { color: 'rgb(204, 204, 204)' },
    'full::placeholder': { color: 'rgb(204, 204, 204)' },
    'blank::placeholder': { color: 'rgb(204, 204, 204)' },
    gone: { visibility: 'hidden' },
    'gone::placeholder': { color: 'rgb(204, 204, 204)' },
  });
  const { violations, incomplete, counts } = plain(await window.__kosh.contrast());
  assert.deepStrictEqual(violations.map((node) => [node.selector, node.ratio, node.threshold, node.reason, node.textColor, node.background]), [
    ['#bad', 1.61, 4.5, 'placeholder', '#cccccc', '#ffffff'],
    ['#area', 1.61, 4.5, 'placeholder', '#cccccc', '#ffffff'],
  ]);
  assert.deepStrictEqual(incomplete, []);
  assert.strictEqual(counts.violations, 2);
});

test('contrast: large placeholder text gets the 3:1 threshold, and its opacity counts', async () => {
  const window = withRealColors('<input id="big" placeholder="Search"><input id="faint" placeholder="Faint">', {
    'big::placeholder': { color: 'rgb(130, 130, 130)', fontSize: '24px' },
    'faint::placeholder': { color: 'rgb(51, 51, 51)', opacity: '0.3' },
  });
  const { violations } = await window.__kosh.contrast();
  assert.deepStrictEqual(plain(violations).map((node) => node.selector), ['#faint']);
  assert.ok(violations[0].ratio < 2);
  assert.strictEqual(violations[0].textColor, '#333333 at 30%');
});

test('contrast: a placeholder on a gradient that straddles the threshold is incomplete, with its range', async () => {
  const window = withRealColors('<input id="field" placeholder="Email">', { field: { backgroundImage: 'linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))' }, 'field::placeholder': { color: 'rgb(136, 136, 136)' } });
  const { violations, incomplete } = await window.__kosh.contrast();
  assert.strictEqual(violations.length, 0);
  assert.strictEqual(incomplete[0].reason, 'placeholder');
  assert.strictEqual(incomplete[0].ratio, null);
  assert.ok(incomplete[0].ratioRange.min < 4.5 && incomplete[0].ratioRange.max > 4.5);
});

test("contrast: axe's own results stand when its helpers can't run", async () => {
  const window = withRealColors('<input id="bad" placeholder="Email">', {}, () => ({ violations: [{ id: 'color-contrast', nodes: [axeNode(['p'], { contrastRatio: 2, expectedContrastRatio: '4.5:1' })] }] }));
  window.axe.setup = () => { throw new Error('Axe is already setup'); };
  const { violations } = await window.__kosh.contrast();
  assert.deepStrictEqual(plain(violations).map((node) => node.selector), ['p']);
});

// A page with layout faked per element: `boxes` maps an id to its measurements.
const laidOut = (body, { boxes = {}, styles = {}, results = () => ({}), height = 0, innerHeight = 500 } = {}) => {
  const window = withRealColors(body, styles, results);
  const scrolled = [];
  window.scrollTo = (options) => scrolled.push(options);
  Object.defineProperty(window, 'innerHeight', { value: innerHeight });
  Object.defineProperty(window.document.documentElement, 'scrollHeight', { value: height, configurable: true });
  for (const [id, box] of Object.entries(boxes)) {
    const element = id === 'root' ? window.document.documentElement : window.document.getElementById(id);
    for (const [key, value] of Object.entries(box)) {
      if (key === 'rect') element.getBoundingClientRect = () => value;
      else Object.defineProperty(element, key, { value, configurable: true });
    }
  }
  return { window, scrolled };
};

test('page: scrolls to the bottom and back to the top, instantly, and stops at its step cap', async () => {
  const short = laidOut('', { height: 1000 });
  await short.window.__kosh.page();
  assert.deepStrictEqual(plain(short.scrolled), [0, 400, 800, 0].map((top) => ({ top, behavior: 'instant' })));

  const tall = laidOut('', { height: 500000 });
  await tall.window.__kosh.page();
  assert.strictEqual(tall.scrolled.length, 31);
  assert.ok(tall.scrolled.at(-2).top > 400000, 'a very tall page is still reached, in bigger steps');
});

test('page: a page that keeps growing stops at the step cap', async () => {
  const { window, scrolled } = laidOut('');
  let height = 1000;
  Object.defineProperty(window.document.documentElement, 'scrollHeight', { get: () => (height += 1000) });
  await window.__kosh.page();
  assert.strictEqual(scrolled.length, 31);
});

test('page: images lose their long diagnosis, keep their category, and a clean page keeps its message', async () => {
  const { window } = laidOut('');
  assert.match((await window.__kosh.page()).images, /sufficiently sized/);

  const flagged = laidOut('<img id="i" src="https://example.com/a.jpg">', { boxes: { i: { naturalWidth: 100, naturalHeight: 100, complete: true, currentSrc: 'https://example.com/a.jpg', offsetWidth: 800, offsetHeight: 800, rect: { width: 800, height: 800, left: 0, right: 800 } } } });
  const { images } = await flagged.window.__kosh.page();
  assert.strictEqual(images[0].diagnosisCategory, 'source');
  assert.ok(!('diagnosis' in images[0]));
  assert.ok('diagnosis' in flagged.window.__kosh.images()[0], '__kosh.images() still has the words');
});

test('page: contrast elements with one measurement become one row with a count, keeping the true counts', async () => {
  const same = (selector) => axeNode([selector], { fgColor: '#bbb', bgColor: '#fff', contrastRatio: 1.9, expectedContrastRatio: '4.5:1', fontSize: '12pt' }, `<p>${'x'.repeat(200)}</p>`);
  const { window } = laidOut('', { results: () => ({ violations: [{ id: 'color-contrast', nodes: [same('p.a'), same('p.b'), axeNode(['p.c'], { contrastRatio: 3, expectedContrastRatio: '4.5:1' })] }] }) });
  const { contrast } = await window.__kosh.page();
  assert.deepStrictEqual(plain(contrast.violations).map((row) => [row.selector, row.count]), [['p.a', 2], ['p.c', 1]]);
  assert.ok(contrast.violations[0].html.length <= 81);
  assert.ok(!('fontSize' in contrast.violations[0]));
  assert.strictEqual(contrast.counts.violations, 3);
});

test("page: a contrast failure doesn't lose the rest", async () => {
  const { window } = laidOut('<h1>Title</h1>');
  window.axe.run = async () => { throw new Error('Axe is already running'); };
  const result = await window.__kosh.page();
  assert.match(result.contrast.error, /already running/);
  assert.strictEqual(result.headings.length, 1);
});

test('page: without axe, contrast says so and the rest still comes back', async () => {
  const window = page('https://example.com/');
  window.scrollTo = () => {};
  const result = await window.__kosh.page();
  assert.match(result.contrast, /axe-core is not loaded/);
  assert.deepStrictEqual(plain(result.headings), []);
});

test('page: headings carry their size and weight, skip hidden ones and clip long text', async () => {
  const { window } = laidOut(`<h1 id="a">  Big\n title </h1><h2 id="b">Hidden</h2><h3 id="c">${'y'.repeat(100)}</h3>`, { styles: { a: { fontSize: '48.5px', fontWeight: '700' }, b: { visibility: 'hidden' }, c: { fontSize: '18px' } } });
  const { headings } = await window.__kosh.page();
  assert.deepStrictEqual(plain(headings), ['h1 48.5px/700 Big title', `h3 18px/400 ${'y'.repeat(80)}…`]);
});

test('page: text is main\'s, with blank lines closed up, and says when it was cut', async () => {
  const { window } = laidOut('<nav>Menu</nav><main id="m">x</main><footer>Footer</footer>', { boxes: { m: { innerText: '  One\n\n \n\nTwo\nThree  ' } } });
  assert.strictEqual((await window.__kosh.page()).text, 'One\nTwo\nThree');
  const long = laidOut('<main id="m">x</main>', { boxes: { m: { innerText: 'y'.repeat(8001) } } });
  assert.strictEqual((await long.window.__kosh.page()).text, `${'y'.repeat(8000)}…`);
  const exact = laidOut('<main id="m">x</main>', { boxes: { m: { innerText: 'y'.repeat(8000) } } });
  assert.strictEqual((await exact.window.__kosh.page()).text, 'y'.repeat(8000));
});

test('page: a page with no main gives the body\'s text', async () => {
  const { window } = laidOut('<div>Only this</div>');
  assert.strictEqual((await window.__kosh.page()).text, 'Only this');
});

test('page: clipped text is an element cutting off its own text, not a screen-reader label, a scroller or an empty wrapper', async () => {
  const cut = { clientWidth: 100, clientHeight: 20, scrollWidth: 300, scrollHeight: 20 };
  const { window } = laidOut(`
    <p id="cut">Cut off text</p>
    <span id="sr">Screen reader text</span>
    <div id="scroller">Scrolls</div>
    <div id="wrapper"><img src="https://example.com/a.svg"></div>
    <p id="fits">Fits</p>
  `, {
    boxes: { cut, sr: { ...cut, clientWidth: 1, clientHeight: 1 }, scroller: cut, wrapper: cut, fits: { clientWidth: 100, clientHeight: 20, scrollWidth: 100, scrollHeight: 21 } },
    styles: { cut: { overflowX: 'hidden', overflowY: 'visible' }, sr: { overflowX: 'hidden', overflowY: 'hidden' }, scroller: { overflowX: 'auto', overflowY: 'visible' }, wrapper: { overflowX: 'hidden', overflowY: 'visible' }, fits: { overflowX: 'hidden', overflowY: 'hidden' } },
  });
  const { clipped } = await window.__kosh.page();
  assert.deepStrictEqual(plain(clipped), [{ selector: '#cut', text: 'Cut off text', box: '100x20', content: '300x20' }]);
});

test('page: overflow names the outermost element past the viewport, not its children, a scroller inside or a fixed panel', async () => {
  const past = { width: 500, height: 10, left: 900, right: 1400 };
  const { window } = laidOut(`
    <div id="wide"><span id="inner"></span></div>
    <div id="scroller"><div id="scrolled"></div></div>
    <div id="fixed"></div>
    <div id="fine"></div>
    <div id="empty"></div>
  `, {
    boxes: {
      root: { clientWidth: 1000, scrollWidth: 1400 },
      wide: { rect: past }, inner: { rect: past }, scrolled: { rect: past }, fixed: { rect: past },
      fine: { rect: { width: 500, height: 10, left: 0, right: 1000.5 } },
      empty: { rect: { width: 0, height: 0, left: 2000, right: 2000 } },
    },
    styles: { scroller: { overflowX: 'auto' }, fixed: { position: 'fixed' }, wide: { overflowX: 'visible' }, inner: { overflowX: 'visible' }, scrolled: { overflowX: 'visible' } },
  });
  const { overflow } = await window.__kosh.page();
  assert.deepStrictEqual(plain(overflow), { viewportWidth: 1000, pageWidth: 1400, elements: [{ selector: '#wide', left: 900, right: 1400 }] });
});

test('page: an unawaited call says so', () => {
  const window = page('https://example.com/');
  window.scrollTo = () => {};
  assert.match(window.__kosh.page().notAwaited, /`await __kosh\.page\(\)`/);
});
