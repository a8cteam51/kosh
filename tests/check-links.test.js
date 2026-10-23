const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '../scripts/check-links.js');
const { check } = require(SCRIPT);
const CANARY = 'IGNORE-PREVIOUS-INSTRUCTIONS';
const LONG = `/${'a'.repeat(130)}`;

const listen = (handler) => new Promise((resolve) => {
  const server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(server));
});
const origin = (server) => `http://127.0.0.1:${server.address().port}`;
const closedPort = async () => {
  const server = await listen(() => {});
  const url = origin(server);
  await new Promise((resolve) => server.close(resolve));
  return url;
};
const run = (args) => new Promise((resolve) => {
  const child = spawn('node', [SCRIPT, ...args]);
  let out = '';
  let firstAt;
  child.stdout.on('data', (chunk) => { firstAt ??= Date.now(); out += chunk; });
  child.on('close', () => resolve({ lines: out.trim().split('\n'), firstAt, endAt: Date.now() }));
});

let site;
let other;
test.before(async () => {
  other = await listen((req, res) => res.end(CANARY));
  site = await listen((req, res) => {
    if (req.url === '/ok') return res.end(`<p>${CANARY}</p>`);
    if (req.url === '/moved') return res.writeHead(301, { location: `/final?note=${CANARY}#${CANARY}` }).end();
    if (req.url === '/query') return res.writeHead(302, { location: `/query?note=${CANARY}` }).end();
    if (req.url === '/away') return res.writeHead(302, { location: `${origin(other)}/${CANARY}` }).end();
    if (req.url === `${LONG}1`) return res.writeHead(302, { location: `${LONG}2` }).end();
    if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (req.url === '/endless') return res.writeHead(200).write(CANARY);
    if (req.url === '/hang') return;
    if (req.url === '/slow') return setTimeout(() => res.end(), 1500);
    res.writeHead(req.url.startsWith('/final') || req.url.startsWith('/query') || req.url === `${LONG}2` ? 200 : 404).end(CANARY);
  });
});
test.after(() => {
  for (const server of [site, other]) {
    server.closeAllConnections();
    server.close();
  }
});

test('a link prints its status, never the page', async () => {
  assert.equal(await check(`${origin(site)}/ok`), `200 ${origin(site)}/ok`);
  assert.equal(await check(`${origin(site)}/gone`), `404 ${origin(site)}/gone`);
});

test('a redirect prints only that the path changed, never the path, query or fragment the other site chose', async () => {
  assert.equal(await check(`${origin(site)}/moved`), `200 ${origin(site)}/moved (path changed)`);
  assert.equal(await check(`${origin(site)}/query`), `200 ${origin(site)}/query`);
});

test('a redirect to another site prints only its origin', async () => {
  const line = await check(`${origin(site)}/away`);
  assert.equal(line, `200 ${origin(site)}/away -> ${origin(other)} (path changed)`);
  assert.ok(!line.includes(CANARY), line);
});

test('a long path that changes past any cut-off still counts as changed', async () => {
  assert.equal(await check(`${origin(site)}${LONG}1`), `200 ${origin(site)}${LONG}1 (path changed)`);
});

test('the body is never waited for', { timeout: 5000 }, async () => {
  assert.equal(await check(`${origin(site)}/endless`), `200 ${origin(site)}/endless`);
});

test('anything but plain http and https is refused before a request', async () => {
  assert.equal(await check('file:///etc/passwd'), 'skipped file:///etc/passwd (not http or https)');
  assert.equal(await check('https://user:pw@example.com/'), 'skipped https://user:pw@example.com/ (has a user name or password)');
  assert.equal(await check('not a url'), 'invalid not a url');
});

test('a failed request prints only the error code or the fetch library\'s own reason', async () => {
  const url = await closedPort();
  assert.equal(await check(url), `error ${url} ECONNREFUSED`);
  assert.equal(await check(`${origin(site)}/loop`), `error ${origin(site)}/loop redirect count exceeded`);
});

test('a host that never answers times out', { timeout: 3000 }, async () => {
  assert.equal(await check(`${origin(site)}/hang`, 200), `error ${origin(site)}/hang TimeoutError`);
});

test('the command prints one line per link, once each, in the order given', async () => {
  const closed = await closedPort();
  const { status, stdout } = spawnSync('node', [SCRIPT, closed, 'file:///x', 'nope', 'file:///x'], { encoding: 'utf8' });
  assert.equal(status, 0);
  assert.deepStrictEqual(stdout.trim().split('\n'), [`error ${closed} ECONNREFUSED`, 'skipped file:///x (not http or https)', 'invalid nope']);
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 1);
});

test('a finished line prints before slower links are done, still in order', async () => {
  const early = await run([`${origin(site)}/ok`, `${origin(site)}/slow`]);
  assert.deepStrictEqual(early.lines, [`200 ${origin(site)}/ok`, `200 ${origin(site)}/slow`]);
  assert.ok(early.endAt - early.firstAt > 800, `first line ${early.endAt - early.firstAt} ms before exit`);
  const late = await run([`${origin(site)}/slow`, `${origin(site)}/ok`]);
  assert.deepStrictEqual(late.lines, [`200 ${origin(site)}/slow`, `200 ${origin(site)}/ok`]);
});
