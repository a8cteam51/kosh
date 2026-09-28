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

test('a page cannot replace __kosh or its functions', () => {
  const window = page('https://example.com/');
  const original = window.__kosh.gate;

  window.eval('window.__kosh = {}; __kosh.gate = () => ({ gate: null, redirectedTo: null });');
  assert.throws(() => window.eval('Object.defineProperty(window, "__kosh", { value: {} })'), /redefine/);
  assert.strictEqual(window.__kosh.gate, original);
});
