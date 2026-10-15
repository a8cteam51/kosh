// Playwright MCP's --init-page calls `default` with each tab's page, in Node: it only serializes site data and must never throw.
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

const captureFile = (env = process.env) => {
  const reportsDir = path.resolve(env.KOSH_REPORTS_DIR || path.join(__dirname, '../reports'));
  const session = env.CLAUDE_CODE_SESSION_ID;
  return path.join(reportsDir, 'data', /^[A-Za-z0-9-]+$/.test(session ?? '') ? `capture-${session}.jsonl` : 'capture.jsonl');
};

const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const isWeb = (url) => /^https?:/i.test(url);
const bare = (url) => String(url).split('#')[0];

// A hop on another host is a login or single sign-on step, whose query can carry a token.
const hopUrl = (from, to) => {
  try {
    const hop = new URL(from);
    const host = (url) => url.host.replace(/^www\./, '');
    return host(hop) === host(new URL(to)) ? from : `${hop.origin}${hop.pathname}`;
  } catch {
    return '';
  }
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
    const viewport = { width: innerWidth, height: innerHeight };
    if (nav && nav.loadEventEnd > 0) {
      const resources = performance.getEntriesByType('resource');
      let gate = null;
      try { gate = __kosh.gate(location.href).gate; } catch {}
      return resolve({
        ...(gate && { gate: String(gate) }),
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
  const shifts = buffered('layout-shift').filter((shift) => !shift.hadRecentInput);
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
    quietFor: now - Math.max(loaded, ...paints.map((entry) => entry.startTime), ...shifts.map((entry) => entry.startTime)),
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
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line);
    }
  };
  writers.set(file, write);
  return write;
};

const consoleEntry = (message) => ({ type: 'console', level: message.type(), text: clip(message.text(), MAX_TEXT), source: clip(message.location()?.url, MAX_URL) });
const pageErrorEntry = (error) => ({ type: 'console', level: 'pageerror', text: clip(error?.message, MAX_TEXT) });
const isReported = (message) => ['error', 'warning'].includes(message.type());

const processId = crypto.randomBytes(3).toString('hex');
let visits = 0;

exports.captureFile = captureFile;
exports.readTiming = readTiming;
exports.readVitals = readVitals;

exports.default = async ({ page }) => {
  try {
    const write = writerFor(captureFile());
    const handled = new WeakSet();
    let pending = null;
    let current = null;
    let held = null;

    // isNavigationRequest() goes first: frame() throws for a service worker's requests.
    const isMainNavigation = (request) => request.isNavigationRequest() && request.frame() === page.mainFrame();

    const row = (visit, entry) => {
      if (!visit) return;
      visit.rows += 1;
      if (visit.rows <= MAX_ROWS_PER_VISIT) write({ visit: visit.id, ...entry });
      else if (visit.rows === MAX_ROWS_PER_VISIT + 1) write({ type: 'truncated', visit: visit.id, reason: 'rows' });
    };

    const networkRow = (visit, request, response) => {
      const failure = request.failure()?.errorText;
      if (!failure && !(response?.status() >= 400)) return;
      row(visit, { type: 'network', url: clip(request.url(), MAX_URL), status: failure ? null : response.status(), ...(failure && { failure: clip(failure, MAX_TEXT) }), resourceType: request.resourceType() });
    };

    const consoleRow = (entry) => (held ? held.push([current, entry]) : row(current, entry));

    const writeVisit = (visit) => {
      write({ type: 'visit', visit: visit.id, url: clip(visit.url, MAX_URL), status: visit.status, redirectedFrom: visit.redirectedFrom.map((from) => hopUrl(from, visit.url)), ...(visit.failure && { failure: clip(visit.failure, MAX_TEXT) }), ...(visit.caughtUp && { caughtUp: true }) });
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
      if (load.loadTime !== null) await recordVitals(visit, timeOrigin);
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
        writeVisit(current);
      } else if (!isWeb(url)) {
        current = null;
      }
    }));

    page.on('load', safe(() => recordLoad(current)));

    page.on('console', safe((message) => {
      if (isReported(message)) consoleRow(consoleEntry(message));
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
  } catch {}
};
