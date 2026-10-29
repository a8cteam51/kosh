// Usage: node page-capture.js summary <site-url> [<page-url>…] | merge <report.json> [--<type>]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CAPTURE_NAME, captureFile, redactUrl, siteHost: host } = require('../collectors/capture.js');

const normal = (url) => {
  try {
    const parsed = new URL(redactUrl(url));
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '');
    return parsed.href;
  } catch { return null; }
};

const readEntries = (file) => {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch {}
  return text.split('\n').flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
};

// The capture a render is working from: the browser keeps writing to the live file, so what it records from here on starts the next run's.
const takenFile = (file = captureFile()) => `${file}.taken`;
const take = (file = captureFile()) => {
  const taken = takenFile(file);
  if (!fs.existsSync(file)) return taken;
  if (!fs.existsSync(taken)) {
    fs.renameSync(file, taken);
    return taken;
  }
  const moving = `${file}.${process.pid}`;
  fs.renameSync(file, moving);
  fs.appendFileSync(taken, fs.readFileSync(moving));
  fs.unlinkSync(moving);
  return taken;
};

// The report's host, plus pages the run asked for there that redirected elsewhere; other sites the browser loaded stay out of the report and its archive.
const siteVisits = (entries, reportUrl) => {
  const site = host(reportUrl);
  return entries.filter((entry) => entry.type === 'visit' && site && [entry.url, ...(entry.redirectedFrom ?? [])].some((url) => host(url) === site));
};

// A run starts by closing the browser, so an earlier browser's visits are an earlier run's.
const reportEntries = (entries, reportUrl) => {
  const onSite = siteVisits(entries, reportUrl);
  const browser = onSite.at(-1)?.browser;
  const visits = new Set(onSite.filter((entry) => entry.browser === browser).map((entry) => entry.visit));
  return entries.filter((entry) => (entry.visit ? visits.has(entry.visit) : entry.type === 'truncated' || (entry.type === 'wall' && browser && entry.browser === browser)));
};

// The host the run's browser was held to once the gate check cleared, if it was the report's and went up on the first page past any gate, before the rest were measured.
const heldTo = (entries, reportUrl) => {
  const at = entries.findIndex((entry) => entry.type === 'wall' && host(`https://${entry.host}/`) === host(reportUrl));
  if (at === -1) return undefined;
  const gated = new Set(entries.filter((entry) => entry.type === 'load' && entry.gate).map((entry) => entry.visit));
  const before = entries.slice(0, at).filter((entry) => entry.type === 'visit' && host(entry.url) === host(reportUrl) && !gated.has(entry.visit));
  return before.length <= 1 ? entries[at].host : undefined;
};

const visitCount = (entries) => entries.filter((entry) => entry.type === 'visit').length;
const archiveText = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';

// Timings, vitals and the viewport were read in the page's own world, which a site can patch to return anything.
const number = (value) => (Number.isFinite(value) ? value : null);
const viewportOf = (viewport) => (Number.isInteger(viewport?.width) && Number.isInteger(viewport?.height) ? `${viewport.width}x${viewport.height}` : null);

const unique = (rows) => [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()];

// ponytail: the first visit per page and viewport is the measurement, since a revisit loads from a warm cache; later visits only add console and network rows.
const buildPages = (entries) => {
  const visits = new Map(entries.filter((entry) => entry.type === 'visit').map((entry) => [entry.visit, { entry, load: null, vitals: null, console: [], network: [], truncated: false }]));
  for (const entry of entries) {
    const visit = visits.get(entry.visit);
    if (!visit || entry.byModel) continue;
    if (entry.type === 'load' || entry.type === 'vitals') visit[entry.type] = entry;
    else if (entry.type === 'console') visit.console.push({ level: entry.level, text: entry.text, ...(entry.source && { source: entry.source }) });
    else if (entry.type === 'network') visit.network.push({ url: entry.url, status: entry.status, ...(entry.failure && { failure: entry.failure }), resourceType: entry.resourceType });
    else if (entry.type === 'truncated') visit.truncated = true;
  }

  const pages = new Map();
  for (const { entry, load, vitals, ...rows } of visits.values()) {
    // A coming-soon or password page is served at the site's own URL, and the site is the page loaded after it.
    if (load?.gate) continue;
    const viewport = viewportOf(load?.viewport);
    const key = `${normal(entry.url)} ${viewport}`;
    const page = pages.get(key);
    if (page) {
      page.visits += 1;
      page.redirectedFrom = unique([...page.redirectedFrom, ...(entry.redirectedFrom ?? [])]);
      page.console = unique([...page.console, ...rows.console]);
      page.network = unique([...page.network, ...rows.network]);
      if (rows.truncated) page.truncated = true;
      continue;
    }
    pages.set(key, {
      url: entry.url,
      redirectedFrom: entry.redirectedFrom ?? [],
      viewport,
      status: entry.status ?? null,
      ...(entry.failure && { failure: entry.failure }),
      visits: 1,
      loadTime: number(load?.loadTime),
      domContentLoaded: number(load?.domContentLoaded),
      ttfb: number(load?.ttfb),
      transferSize: number(load?.transferSize),
      resourceTransferSize: number(load?.resourceTransferSize),
      ...(load?.error && { timingError: load.error }),
      ...(load?.loggedIn === true && { loggedIn: true }),
      lcp: number(vitals?.lcp),
      cls: number(vitals?.cls),
      vitalsSettled: vitals ? vitals.settled === true : null,
      console: unique(rows.console),
      network: unique(rows.network),
      ...(rows.truncated && { truncated: true }),
    });
  }
  return [...pages.values()];
};

const covers = (page, url) => [page.url, ...page.redirectedFrom].some((seen) => normal(seen) === normal(url));
const uncovered = (urls, pages) => urls.filter((url) => !pages.some((page) => covers(page, url)));

// Restarting Claude Code starts a new session id, which would strand a capture another session left.
const missingCapture = (live) => {
  let others = [];
  try { others = fs.readdirSync(path.dirname(live)).filter((name) => CAPTURE_NAME.test(name)); } catch {}
  return others.length
    ? `Warning: no page capture at ${live} (left alone: ${others.join(', ')}). If this run's pages are in one of those, re-run from the Claude Code session that loaded them.`
    : `Warning: no page capture at ${live}. A browser started before kosh added the capture records none: restart Claude Code.`;
};

const merge = (reportPath, flags) => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const taken = take();
  if (!fs.existsSync(taken)) console.warn(missingCapture(captureFile()));
  const all = readEntries(taken);
  const entries = reportEntries(all, report.url);
  // Required here because validate-report.js requires this file.
  const { isDateTime, typesFor } = require('./validate-report.js');
  // The model's own value is a placeholder or a guess.
  const started = entries.find((entry) => entry.type === 'visit')?.at;
  const written = isDateTime(report.timestamp) ? report.timestamp : null;
  report.timestamp = (started ?? written ?? new Date().toISOString()).replace(/\.\d+Z$/, 'Z');

  // Without the hash, validation reads a performance report's pages[] as the model's.
  if (visitCount(entries)) report.provenance ??= {};
  if (report.provenance && typeof report.provenance === 'object') {
    if (visitCount(entries)) report.provenance.captureSha256 = crypto.createHash('sha256').update(archiveText(entries)).digest('hex');
    else delete report.provenance.captureSha256;
    const held = heldTo(entries, report.url);
    if (held) report.provenance.heldTo = held;
    else delete report.provenance.heldTo;
  }
  const performance = typesFor(flags, report).includes('performance');
  if (performance) report.pages = buildPages(entries);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!performance) return;

  const listed = report.visitedPages ?? [];
  const unlisted = report.pages.filter((page) => !listed.some((url) => covers(page, url)));
  const gated = entries.filter((entry) => entry.type === 'load' && entry.gate).length;
  const fromModel = entries.filter((entry) => entry.byModel).length;
  const earlier = siteVisits(all, report.url).length - visitCount(entries);
  const leftOut = [
    gated && `${gated} gate page${gated > 1 ? 's' : ''}`,
    fromModel && `${fromModel} row${fromModel > 1 ? 's' : ''} from the model's own code`,
    earlier && `${earlier} visit${earlier > 1 ? 's' : ''} from an earlier browser`,
  ].filter(Boolean);
  console.log(`Page capture merged: ${report.pages.length} page × viewport rows from ${visitCount(entries)} visits on ${host(report.url)}${leftOut.length ? `, leaving out ${leftOut.join(' and ')}` : ''}`);
  if (unlisted.length) console.log(`  Captured but not in visitedPages: ${unlisted.map((page) => `${page.url} (${page.viewport ?? 'no viewport'})`).join(', ')}`);
  // Only a fresh run is refused: an archive from before the wall re-renders without one.
  if (report.pages.length && !report.provenance?.heldTo) {
    console.error(`✗ This run's browser wasn't held to ${host(report.url)} while it measured: the gate check (\`__kosh.gate\`) has to come back with both fields null on the first page, before any other is loaded, or nothing keeps the browser on the site. Close the browser with browser_close and run the skill again from the start.`);
    process.exitCode = 1;
  }
};

const summary = ([site, ...urls]) => {
  const file = captureFile();
  const pages = buildPages(reportEntries([...readEntries(takenFile(file)), ...readEntries(file)], site));
  console.log(JSON.stringify(pages, null, 2));
  const missing = uncovered([site, ...urls], pages);
  console.log(missing.length ? `No visit captured yet for: ${missing.join(', ')}` : 'Every page given has a captured visit.');
};

module.exports = { archiveText, buildPages, host, readEntries, reportEntries, take, takenFile, uncovered, visitCount };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'merge' && args[0]) merge(args[0], args.slice(1));
  else if (command === 'summary' && host(args[0])) summary(args);
  else {
    console.error('Usage: node page-capture.js summary <site-url> [<page-url>…] | merge <report.json> [--<type>]');
    process.exitCode = 1;
  }
}
