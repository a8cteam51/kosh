// Playwright MCP's --init-page calls `default` with each tab's page, in Node with the server's file and shell access: it only serializes site data, exposes nothing a page can call, and never throws.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_TEXT = 500;
const MAX_URL = 1000;
const MAX_ROWS_PER_VISIT = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const VITALS_FOR_MS = 10000;
const VITALS_QUIET_MS = 1000;
const VITALS_POLL_MS = 500;
const EVALUATE_URL = 'kosh-evaluate';

// A capture in kosh-reports/data (with the merge's .taken or a failed archive's .<pid>), or an archived one.
const CAPTURE_NAME = /^capture(?:-[A-Za-z0-9-]+)?\.jsonl(?:\.\w+)?$|\.capture\.jsonl$/;

// Claude Code gives MCP servers and hooks the project root; Bash commands get none, so from a subfolder the scripts look up, no further than the git root, for the kosh-reports/ the capture made.
const reportsDir = (env = process.env, cwd = process.cwd()) => {
  if (env.KOSH_REPORTS_DIR || env.CLAUDE_PROJECT_DIR) return path.resolve(cwd, env.KOSH_REPORTS_DIR || path.join(env.CLAUDE_PROJECT_DIR, 'kosh-reports'));
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'kosh-reports', 'data'))) return path.join(dir, 'kosh-reports');
    if (fs.existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) return path.resolve(cwd, 'kosh-reports');
  }
};

// Reports hold client URLs and console text, so kosh-reports/ keeps itself out of the project's git, even when Playwright made the folder first.
const makeReportsDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '*\n');
};

const captureFile = (env = process.env, cwd = process.cwd()) => {
  const session = env.CLAUDE_CODE_SESSION_ID;
  return path.join(reportsDir(env, cwd), 'data', /^[A-Za-z0-9-]+$/.test(session ?? '') ? `capture-${session}.jsonl` : 'capture.jsonl');
};

const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const isWeb = (url) => /^https?:/i.test(url);
const bare = (url) => String(url).split('#')[0];

// ponytail: a name ending in a credential word or equal to an ambiguous one, or an email value, is dropped; a token under any other name is written.
const CREDENTIAL_ENDING = /(token|nonce|secret|password|pwd|apikey|secretkey|accesskey|privatekey|authkey|licensekey|sessid|sessionid|signature|jwt|otp)$/;
const CREDENTIAL_NAME = new Set(['key', 'code', 'share', 'hash', 'sig', 'auth', 'email', 'pass', 'sid', 'session']);
const decode = (text) => {
  try { return decodeURIComponent(text.replace(/\+/g, ' ')); } catch { return text; }
};
const isCredential = (pair) => {
  const split = pair.indexOf('=');
  const name = decode(split === -1 ? pair : pair.slice(0, split)).toLowerCase().replace(/[^a-z0-9]/g, '');
  return CREDENTIAL_ENDING.test(name) || CREDENTIAL_NAME.has(name) || (split !== -1 && decode(pair.slice(split + 1)).includes('@'));
};
// Pair by pair on the raw query, so what's kept is byte for byte what the browser loaded.
const redactUrl = (url) => {
  try {
    const parsed = new URL(url);
    const pairs = parsed.search.slice(1).split('&');
    const kept = pairs.filter((pair) => !isCredential(pair));
    if (kept.length === pairs.length && !parsed.hash) return url;
    parsed.search = kept.join('&');
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '';
  }
};

const siteHost = (url) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
};

// Only the site URL the run asked for keeps its page query: a step the server or a login host chose can carry a token anywhere.
const hopUrl = (from, to, first) => {
  try {
    const hop = new URL(from);
    return first && siteHost(from) === siteHost(to) ? redactUrl(from) : `${hop.origin}${hop.pathname}`;
  } catch {
    return '';
  }
};

// The checkout wall: Chrome pauses every navigation, fetch, XHR and beacon, but no image, script or style, so the cache stays on (a Playwright route turns it off for the page).
const ORDER_PATTERNS = ['Document', 'XHR', 'Fetch', 'Ping'].map((resourceType) => ({ urlPattern: '*', resourceType }));
// What WooCommerce acts on, read the way PHP and WooCommerce read it: the Store API checkout or order-pay route (by path, rest_route or batch), classic checkout's AJAX action, and the classic checkout and order-pay forms' submit fields; never a nonce name, which update_order_review's post_data carries too.
const ORDER_ROUTE = /\/wc\/store(?:\/v\d+)?\/checkout\b/;
const ORDER_FIELDS = ['woocommerce_checkout_place_order', 'woocommerce_pay'];
// PHP decodes each %XX it can and skips a stray %, so one broken sequence can't hide the rest; JSON's \u escapes are undone by a round trip.
const unescape = (text) => text.replace(/%([0-9a-f]{2})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
const normalize = (text) => {
  let out = String(text ?? '');
  try { out = JSON.stringify(JSON.parse(out)); } catch {}
  return unescape(out).toLowerCase();
};
// PHP 8's field names: a[b] is a, otherwise every space, dot and [ is _, and leading spaces go.
const phpName = (name) => {
  const open = name.indexOf('[');
  const base = open !== -1 && name.indexOf(']', open) !== -1 ? name.slice(0, open) : name;
  return base.replace(/^ +/, '').replace(/[ .[]/g, '_');
};
// A query string or form body as PHP parses it: + is a space and the last value for a name wins.
const phpParams = (text) => {
  const params = new Map();
  for (const pair of text.split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    const [name, value] = (at === -1 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)]).map((part) => unescape(part.replace(/\+/g, ' ')));
    params.set(phpName(name), value);
  }
  return params;
};
// sanitize_text_field, which WooCommerce runs on wc-ajax: tags out, whitespace collapsed and trimmed, leftover %XX removed.
const phpTrim = (text) => text.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, '');
const sanitizeText = (text) => {
  let out = phpTrim(text.replace(/<(script|style)[^>]*?>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, '').replace(/[\r\n\t ]+/g, ' '));
  if (!/%[a-f0-9]{2}/i.test(out)) return out;
  while (/%[a-f0-9]{2}/i.test(out)) out = out.replace(/%[a-f0-9]{2}/gi, '');
  return phpTrim(out.replace(/ +/g, ' '));
};
// What Chrome can give of the body: a part it can't, like a stream or a file from disk, is left out, and an order URL is refused without it.
const bodyOf = (request) => request.postData ?? (request.postDataEntries ?? []).map((entry) => (entry.bytes === undefined ? '' : Buffer.from(entry.bytes, 'base64').toString())).join('');
// The REST API takes its method from _method, else X-HTTP-Method-Override, whatever the request's own is.
const isOrder = (request) => {
  if (!request) return false;
  const url = String(request.url ?? '');
  const query = phpParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '');
  const header = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === 'x-http-method-override')?.[1];
  if (request.method !== 'POST' && String(query.has('_method') ? query.get('_method') : header ?? '').toUpperCase() !== 'POST') return false;
  const orderUrl = ORDER_ROUTE.test(normalize(url)) || sanitizeText(query.get('wc-ajax') ?? '') === 'checkout';
  const body = bodyOf(request);
  const fields = new Set([...phpParams(body).keys(), ...[...body.matchAll(/name="([^"]*)"/g)].map(([, name]) => phpName(name))]);
  return orderUrl || ORDER_ROUTE.test(normalize(body)) || ORDER_FIELDS.some((field) => fields.has(field));
};

const safe = (fn) => (...args) => {
  try {
    const result = fn(...args);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {}
};

// ponytail: these reads run in the page's own world, so a page that patches performance can fake its timings; a CDP isolated world closes that.
const readTiming = () => new Promise((resolve) => {
  const started = Date.now();
  const read = () => {
    const nav = performance.getEntriesByType('navigation')[0];
    // Read from the page because headed Playwright reports no viewport.
    const viewport = { width: innerWidth, height: innerHeight };
    if (nav && nav.loadEventEnd > 0) {
      const resources = performance.getEntriesByType('resource');
      let gate = null;
      try { gate = __kosh.gate(location.href).gate; } catch {}
      let loggedIn = false;
      try { loggedIn = document.body.classList.contains('logged-in'); } catch {}
      return resolve({
        ...(gate && { gate: String(gate) }),
        ...(loggedIn === true && { loggedIn }),
        documentUrl: nav.name,
        timeOrigin: performance.timeOrigin,
        viewport,
        loadTime: Math.round(nav.loadEventEnd),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        ttfb: Math.round(nav.responseStart),
        transferSize: nav.transferSize,
        resourceTransferSize: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        navType: nav.type,
      });
    }
    if (Date.now() - started > 3000) return resolve({ documentUrl: nav?.name, viewport, loadTime: null });
    setTimeout(read, 25);
  };
  read();
});

// What the page holds when it loads, for functional's page table; a link or heading with no layout box (another breakpoint's copy, a closed menu) is marked hidden.
const readInventory = () => {
  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const hidden = (element) => (element.getClientRects().length ? {} : { hidden: true });
  const meta = (key) => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute('content') ?? null;
  const links = all('a[href]');
  const images = all('img');
  const headings = all('h1, h2, h3, h4, h5, h6');
  return {
    title: document.title,
    counts: { links: links.length, images: images.length, headings: headings.length },
    headings: headings.slice(0, 100).map((heading) => ({ tag: heading.tagName.toLowerCase(), text: text(heading.textContent), ...hidden(heading) })),
    links: links.slice(0, 300).map((link) => ({ text: text(link.textContent || link.getAttribute('aria-label') || link.querySelector('img')?.alt), href: link.href, ...hidden(link) })),
    images: images.slice(0, 150).map((image) => ({ src: image.currentSrc || image.src, alt: image.getAttribute('alt') })),
    meta: {
      description: meta('description'),
      ogTitle: meta('og:title'), ogDescription: meta('og:description'), ogImage: meta('og:image'), ogUrl: meta('og:url'), ogType: meta('og:type'),
      twitterCard: meta('twitter:card'), twitterTitle: meta('twitter:title'), twitterDescription: meta('twitter:description'), twitterImage: meta('twitter:image'),
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href ?? null,
    },
  };
};

const MAX_LABEL = 120;
const MAX_META = 300;
const LIMITS = { headings: 100, links: 300, images: 150 };
// The page answers in its own world, so its sizes and shapes are checked again here.
const inventoryEntry = (read) => {
  const list = (key, map) => (Array.isArray(read?.[key]) ? read[key].slice(0, LIMITS[key]).filter((item) => item && typeof item === 'object').map(map) : []);
  const label = (value) => clip(value, MAX_LABEL);
  const url = (value) => clip(redactUrl(String(value ?? '')), MAX_URL);
  const hidden = (item) => (item.hidden === true ? { hidden: true } : {});
  const count = (key) => (Number.isInteger(read?.counts?.[key]) ? read.counts[key] : null);
  const meta = Object.fromEntries(['description', 'ogTitle', 'ogDescription', 'ogImage', 'ogUrl', 'ogType', 'twitterCard', 'twitterTitle', 'twitterDescription', 'twitterImage', 'canonical', 'appleTouchIcon']
    .map((key) => {
      const value = read?.meta?.[key];
      // A share tag's URL that doesn't parse, like a relative og:image, is kept as written: that it isn't absolute is the finding.
      return [key, typeof value !== 'string' ? null : /^(og(Image|Url)|twitterImage|canonical|appleTouchIcon)$/.test(key) ? clip(redactUrl(value) || value, MAX_URL) : clip(value, MAX_META)];
    }));
  return {
    title: clip(read?.title, MAX_META),
    counts: { headings: count('headings'), links: count('links'), images: count('images') },
    headings: list('headings', (item) => ({ tag: /^h[1-6]$/.test(item.tag) ? item.tag : 'h?', text: label(item.text), ...hidden(item) })),
    links: list('links', (item) => ({ text: label(item.text), href: url(item.href), ...hidden(item) })),
    images: list('images', (item) => ({ src: url(item.src), alt: typeof item.alt === 'string' ? label(item.alt) : null })),
    meta,
  };
};

// CLS is the largest burst of shifts under 1 s apart and at most 5 s long, leaving out shifts just after input: https://web.dev/articles/cls
const readVitals = () => {
  const buffered = (type) => {
    const observer = new PerformanceObserver(() => {});
    observer.observe({ type, buffered: true });
    const entries = observer.takeRecords();
    observer.disconnect();
    return entries;
  };
  const paints = buffered('largest-contentful-paint');
  const buffer = buffered('layout-shift');
  const shifts = buffer.filter((shift) => !shift.hadRecentInput);
  let cls = 0;
  let burst = 0;
  let first = 0;
  let last = 0;
  for (const shift of shifts) {
    if (burst && shift.startTime - last < 1000 && shift.startTime - first < 5000) burst += shift.value;
    else [burst, first] = [shift.value, shift.startTime];
    last = shift.startTime;
    cls = Math.max(cls, burst);
  }
  const loaded = performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? 0;
  const now = performance.now();
  return {
    timeOrigin: performance.timeOrigin,
    lcp: paints.length ? Math.round(paints.at(-1).startTime) : null,
    cls: Math.round(cls * 1000) / 1000,
    // ponytail: Chrome buffers 150 layout shifts and drops the rest, so a full buffer reads as never quiet; an observer started in kosh.js would see them all.
    quietFor: buffer.length >= 150 ? 0 : now - Math.max(loaded, ...paints.map((entry) => entry.startTime), ...shifts.map((entry) => entry.startTime)),
    sinceLoad: now - loaded,
  };
};

const writers = new Map();
const writerFor = (file) => {
  if (writers.has(file)) return writers.get(file);
  let full = false;
  const write = (entry) => {
    let size = 0;
    try { size = fs.statSync(file).size; } catch {}
    if (size > MAX_FILE_BYTES) {
      if (!full) fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), type: 'truncated', reason: 'file' }) + '\n');
      full = true;
      return;
    }
    full = false;
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
    try {
      fs.appendFileSync(file, line);
    } catch {
      makeReportsDir(path.dirname(path.dirname(file)));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line);
    }
  };
  writers.set(file, write);
  return write;
};

// Chrome quotes whole URLs in CORS, CSP and mixed-content messages, and a page error can carry one.
const redactText = (text) => String(text ?? '').replace(/https?:\/\/[^\s'"]+/g, (url) => redactUrl(url) || url);
const consoleEntry = (message) => ({ type: 'console', level: message.type(), text: clip(redactText(message.text()), MAX_TEXT), source: clip(redactUrl(message.location()?.url), MAX_URL) });
const pageErrorEntry = (error) => ({ type: 'console', level: 'pageerror', text: clip(redactText(error?.message), MAX_TEXT) });
const isReported = (message) => ['error', 'warning'].includes(message.type());

// The off-host wall: after the model's gate check clears (it needs other hosts' redirects and logins until then), the browser and the model's own requests stay on that host.
const WALL_WAIT_MS = 500;
// The URL the gate check asked about, if it came back clear; browser_evaluate's wrapper answers { result, isFunction }.
const clearedGate = (arg, value) => {
  const answer = value && typeof value === 'object' && 'isFunction' in value ? value.result : value;
  const asked = /__kosh\s*\.\s*gate\s*\(\s*(["'`])(.*?)\1/.exec(arg)?.[2];
  return asked && answer?.gate === null && answer?.redirectedTo === null ? asked : null;
};

// axe-core is ~580 KB, so it's evaluated into a page only for a contrast check, never through the init script that runs on every page performance times.
const callsContrast = (arg) => /__kosh\s*\.\s*contrast\b/.test(arg);
const readAxe = () => {
  try { return `${fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')}\n//# sourceURL=${EVALUATE_URL}`; } catch { return null; }
};

const processId = crypto.randomBytes(3).toString('hex');
let visits = 0;
let browserCount = 0;
const browsers = new WeakMap();
const walls = new WeakMap();
const wallOf = (page) => {
  try { return walls.get(page.context()) ?? null; } catch { return null; }
};

// browser_close ends the context, so a run that starts by closing the browser starts a new one.
const browserOf = (page) => {
  try {
    const context = page.context();
    if (!browsers.has(context)) browsers.set(context, `${processId}-b${++browserCount}`);
    return browsers.get(context);
  } catch {
    return null;
  }
};

exports.captureFile = captureFile;
exports.reportsDir = reportsDir;
exports.makeReportsDir = makeReportsDir;
exports.CAPTURE_NAME = CAPTURE_NAME;
exports.redactUrl = redactUrl;
exports.isOrder = isOrder;
exports.EVALUATE_URL = EVALUATE_URL;
exports.readTiming = readTiming;
exports.readVitals = readVitals;
exports.readInventory = readInventory;
exports.inventoryEntry = inventoryEntry;
exports.WALL_WAIT_MS = WALL_WAIT_MS;
exports.siteHost = siteHost;

exports.default = async ({ page }) => {
  try {
    const write = writerFor(captureFile());
    const browser = browserOf(page);
    // A popup loads before its tab's wall is on, so one that opened on another host is closed before the model can select it.
    const wall = wallOf(page);
    if (wall && isWeb(page.url()) && siteHost(page.url()) !== wall) {
      await page.close().catch(() => {});
      return;
    }
    const handled = new WeakSet();
    let pending = null;
    let current = null;
    let held = null;
    // ponytail: matched by URL within a visit, so the site's own request for a URL the model fetched on that page is tagged too; CDP's requestId would separate them.
    const fromModel = new Set();

    // isNavigationRequest() goes first: frame() throws for a service worker's requests.
    const isMainNavigation = (request) => request.isNavigationRequest() && request.frame() === page.mainFrame();
    const byModel = (url) => fromModel.has(url) && { byModel: true };
    // A console call in browser_evaluate's code is located there; a failed request's message is located at the request.
    const byModelMessage = (message) => (message.location()?.url === EVALUATE_URL ? { byModel: true } : message.text().startsWith('Failed to load resource') && byModel(message.location()?.url));

    const row = (visit, entry) => {
      if (!visit) return;
      visit.rows += 1;
      if (visit.rows <= MAX_ROWS_PER_VISIT) write({ visit: visit.id, ...entry });
      else if (visit.rows === MAX_ROWS_PER_VISIT + 1) write({ type: 'truncated', visit: visit.id, reason: 'rows' });
    };

    // URL, status and type only: headers, cookies and bodies can carry a client's session.
    const networkRow = (visit, request, response) => {
      const failure = request.failure()?.errorText;
      if (!failure && !(response?.status() >= 400)) return;
      row(visit, { type: 'network', url: clip(redactUrl(request.url()), MAX_URL), status: failure ? null : response.status(), ...(failure && { failure: clip(failure, MAX_TEXT) }), resourceType: request.resourceType(), ...byModel(request.url()) });
    };

    const consoleRow = (entry) => (held ? held.push([current, entry]) : row(current, entry));

    const writeVisit = (visit) => {
      write({ type: 'visit', visit: visit.id, ...(browser && { browser }), url: clip(redactUrl(visit.url), MAX_URL), status: visit.status, redirectedFrom: visit.redirectedFrom.map((from, index) => hopUrl(from, visit.url, index === 0)), ...(visit.failure && { failure: clip(visit.failure, MAX_TEXT) }), ...(visit.caughtUp && { caughtUp: true }) });
    };

    // Late shifts count, so this reads until the visit ends or ten seconds after load, writing each change; the visit's last line is its value.
    const recordVitals = async (visit, timeOrigin) => {
      const started = Date.now();
      let last = '';
      try {
        while (Date.now() - started < VITALS_FOR_MS) {
          const read = await page.evaluate(readVitals);
          if (read.timeOrigin !== timeOrigin) return;
          const vitals = { lcp: read.lcp, cls: read.cls, settled: read.quietFor >= VITALS_QUIET_MS };
          if (JSON.stringify(vitals) !== last) write({ type: 'vitals', visit: visit.id, ...vitals });
          last = JSON.stringify(vitals);
          if (read.sinceLoad >= VITALS_FOR_MS) return;
          await new Promise((resolve) => setTimeout(resolve, VITALS_POLL_MS));
        }
      } catch {}
    };

    // A failed visit's load is Chrome's error page, whose timing entry carries the failed URL.
    const recordLoad = async (visit) => {
      if (!visit || visit.loaded || visit.failure) return;
      visit.loaded = true;
      let timing;
      try {
        timing = await page.evaluate(readTiming);
      } catch (error) {
        return write({ type: 'load', visit: visit.id, loadTime: null, error: clip(String(error?.message).split('\n')[0], MAX_TEXT) });
      }
      const { documentUrl, timeOrigin, ...load } = timing;
      // A redirect on load can answer for the next document.
      if (documentUrl !== undefined && bare(documentUrl) !== bare(visit.url)) return write({ type: 'load', visit: visit.id, viewport: load.viewport, loadTime: null, error: 'the timing came from another document' });
      write({ type: 'load', visit: visit.id, ...load });
      if (load.loadTime === null) return;
      try {
        write({ type: 'inventory', visit: visit.id, ...inventoryEntry(await page.evaluate(readInventory)) });
      } catch {}
      await recordVitals(visit, timeOrigin);
    };

    const newVisit = (url) => ({ id: `${processId}-${++visits}`, url, status: null, redirectedFrom: [], loaded: false, rows: 0 });

    page.on('request', safe((request) => {
      if (!isMainNavigation(request)) return;
      const from = request.redirectedFrom();
      if (!from) {
        pending = isWeb(request.url()) ? { ...newVisit(request.url()), request } : null;
      } else if (from === pending?.request) {
        pending.redirectedFrom.push(clip(from.url(), MAX_URL));
        Object.assign(pending, { url: request.url(), request });
      }
    }));

    // A hash jump or a history update commits without a request, at a URL no pending navigation asked for.
    page.on('framenavigated', safe((frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (pending && (bare(url) === bare(pending.url) || (pending.failure && url.startsWith('chrome-error:')))) {
        current = pending;
        pending = null;
        fromModel.clear();
        writeVisit(current);
      } else if (!isWeb(url)) {
        current = null;
      }
    }));

    page.on('load', safe(() => recordLoad(current)));

    page.on('console', safe((message) => {
      if (isReported(message)) consoleRow({ ...consoleEntry(message), ...byModelMessage(message) });
    }));

    page.on('pageerror', safe((error) => consoleRow(pageErrorEntry(error))));

    page.on('response', safe((response) => {
      const request = response.request();
      handled.add(request);
      if (!isMainNavigation(request)) networkRow(current, request, response);
      else if (request === pending?.request) pending.status = response.status();
    }));

    page.on('requestfailed', safe((request) => {
      handled.add(request);
      if (!isMainNavigation(request)) networkRow(current, request, null);
      else if (request === pending?.request) pending.failure = request.failure()?.errorText;
    }));

    // A popup can commit, and even load, before this runs, so what it did until now comes from the page's history.
    if (isWeb(page.url())) {
      const visit = { ...newVisit(page.url()), caughtUp: true };
      current = visit;
      held = [];
      safe(async () => {
        let earlier = [];
        try {
          const [messages, errors, requests] = await Promise.all([() => page.consoleMessages(), () => page.pageErrors(), () => page.requests()].map((read) => Promise.resolve().then(read).catch(() => [])));
          earlier = [...messages.filter(isReported).map(consoleEntry), ...errors.map(pageErrorEntry)];
          const navigation = requests.filter(isMainNavigation).pop();
          if (navigation && bare(navigation.url()) === bare(visit.url)) {
            visit.status = navigation.existingResponse()?.status() ?? null;
            for (let from = navigation.redirectedFrom(); from; from = from.redirectedFrom()) visit.redirectedFrom.unshift(clip(from.url(), MAX_URL));
          }
          for (const request of requests) {
            if (!handled.has(request) && !isMainNavigation(request)) networkRow(visit, request, request.existingResponse());
          }
        } catch {} finally {
          const queued = held;
          held = null;
          writeVisit(visit);
          for (const entry of earlier) row(visit, entry);
          // A message that arrived while the history was being read is in both.
          const unmatched = earlier.map((entry) => JSON.stringify(entry));
          for (const [target, entry] of queued) {
            const match = unmatched.indexOf(JSON.stringify(entry));
            if (match === -1) row(target, entry);
            else unmatched.splice(match, 1);
          }
        }
        if (await page.evaluate(() => document.readyState) === 'complete') await recordLoad(visit);
      })();
    }

    // browser_evaluate hands page.evaluate the model's code as a string; naming it lets Chrome's initiator stack tell its requests from those of Playwright's own URL-less actions, like selectOption.
    // Only browser_evaluate's wrapper evals its string; browser_run_code_unsafe hands the model this page, whose own strings are data.
    const isModelCode = (fn, arg) => typeof arg === 'string' && String(fn).includes('eval(`(${expr})`)');
    const evaluate = page.evaluate;
    // The gate check's answer comes back through here, and the page is held only to the host it was asked about, so a page can't turn the wall on or point it at itself.
    const holdTo = (url, asked) => {
      const context = page.context();
      if (walls.has(context) || !isWeb(url) || siteHost(url) !== siteHost(asked)) return;
      walls.set(context, siteHost(url));
      write({ type: 'wall', ...(browser && { browser }), host: new URL(url).host });
    };
    if (typeof evaluate === 'function') {
      page.evaluate = function (fn, arg, ...rest) {
        if (!isModelCode(fn, arg)) return evaluate.call(this, fn, arg, ...rest);
        const run = () => evaluate.call(this, fn, `eval(${JSON.stringify(`(${arg})\n//# sourceURL=${EVALUATE_URL}`)})`, ...rest);
        let result;
        if (callsContrast(arg)) {
          const axe = readAxe();
          // Refused rather than run, so the page's own axe, if it has one, never stands in for kosh's.
          if (!axe) return Promise.reject(new Error("axe-core is missing from kosh's folder: run `npm ci` there"));
          // Over CDP, so a page's CSP doesn't refuse it.
          result = Promise.resolve().then(() => evaluate.call(this, axe)).then(run, (error) => {
            throw new Error(`kosh couldn't load axe-core into the page: ${error?.message ?? error}`);
          });
        } else {
          result = run();
        }
        return Promise.resolve(result).then((value) => {
          const asked = clearedGate(arg, value);
          if (asked) safe(holdTo)(page.url(), asked);
          return value;
        });
      };
    }

    // Chromium only. Awaited, since MCP navigates a new tab as soon as this returns.
    await (async () => {
      const cdp = await page.context().newCDPSession(page);
      let mainFrameId;
      // A request's tag is set when Chrome first sends it: a redirect hop carries no initiator, and CDP doesn't promise it arrives before the pause.
      const modelRequests = new Map();
      const waiting = new Map();
      cdp.on('Network.requestWillBeSent', safe(({ requestId, request, initiator, redirectResponse }) => {
        const mine = Boolean(initiator?.stack?.callFrames.some((frame) => frame.url === EVALUATE_URL));
        if (mine) fromModel.add(request.url);
        if (!redirectResponse || !modelRequests.has(requestId)) modelRequests.set(requestId, mine);
        waiting.get(requestId)?.();
      }));
      const forget = safe(({ requestId }) => modelRequests.delete(requestId));
      cdp.on('Network.loadingFinished', forget);
      cdp.on('Network.loadingFailed', forget);
      const isModelRequest = async (id) => {
        if (!id) return false;
        if (!modelRequests.has(id)) await new Promise((resolve) => { waiting.set(id, resolve); setTimeout(resolve, WALL_WAIT_MS); });
        waiting.delete(id);
        return modelRequests.get(id) === true;
      };
      // An off-host iframe in one of the site's pages is the site's; a main frame whose id isn't known yet, like a popup's first load, is treated as main.
      const isOffHost = async (event) => {
        const wall = wallOf(page);
        if (!wall || !isWeb(event.request.url) || siteHost(event.request.url) === wall) return false;
        if (event.resourceType === 'Document' && (!mainFrameId || event.frameId === mainFrameId)) return true;
        if (event.resourceType === 'Document' && siteHost(page.url()) !== wall) return true;
        return isModelRequest(event.networkId);
      };
      // Every paused request gets an answer, or the page hangs.
      cdp.on('Fetch.requestPaused', (event) => {
        const requestId = event?.requestId;
        Promise.resolve()
          .then(async () => {
            try { return isOrder(event?.request) || await isOffHost(event); } catch { return false; }
          })
          .then((block) => cdp.send(block ? 'Fetch.failRequest' : 'Fetch.continueRequest', block ? { requestId, errorReason: 'BlockedByClient' } : { requestId }))
          .catch(() => {});
      });
      await Promise.all([
        cdp.send('Fetch.enable', { patterns: ORDER_PATTERNS }),
        cdp.send('Network.enable'),
        cdp.send('Page.getFrameTree').then((tree) => { mainFrameId = tree?.frameTree?.frame?.id; }, () => {}),
      ]);
    })().catch(() => {});
  } catch {}
};
