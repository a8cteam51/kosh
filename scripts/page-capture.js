// Usage: node page-capture.js summary <site-url> [<page-url>…] | inventory <site-url> [<page-url>…] | merge <report.json> [--<type>]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CAPTURE_NAME, captureFile, redactUrl, siteHost: host } = require('../collectors/capture.js');
const { recordFile } = require('./check-links.js');

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

// The page as it loaded, first visit per page and viewport, as functional's page table: what the model would otherwise transcribe.
const INVENTORY_FIELDS = ['title', 'counts', 'headings', 'links', 'images', 'meta'];
const buildInventory = (entries) => {
  const visits = new Map(entries.filter((entry) => entry.type === 'visit').map((entry) => [entry.visit, { entry, load: null, inventory: null }]));
  for (const entry of entries) {
    const visit = visits.get(entry.visit);
    if (visit && (entry.type === 'load' || entry.type === 'inventory')) visit[entry.type] = entry;
  }
  const rows = new Map();
  for (const { entry, load, inventory } of visits.values()) {
    if (load?.gate) continue;
    const viewport = viewportOf(load?.viewport);
    const key = `${normal(entry.url)} ${viewport}`;
    // A later load stands in only for one whose inventory couldn't be read.
    if (rows.has(key) && !(rows.get(key).notRead && inventory)) continue;
    rows.set(key, {
      url: entry.url,
      redirectedFrom: entry.redirectedFrom ?? [],
      viewport,
      status: entry.status ?? null,
      ...(entry.failure && { failure: entry.failure }),
      ...(inventory ? Object.fromEntries(INVENTORY_FIELDS.map((field) => [field, inventory[field]])) : { notRead: true }),
    });
  }
  return [...rows.values()];
};

// The link checker's results since this run's browser first loaded a page, the latest per link: a run starts by closing the browser, so earlier rows are an earlier run's.
const readLinkChecks = (file, since) => {
  const latest = new Map();
  for (const row of readEntries(file)) {
    if (row && typeof row.url === 'string' && !(since && row.at < since)) latest.set(row.url, { url: row.url, outcome: row.outcome, status: number(row.status), redirectedTo: row.redirectedTo ?? null, pathChanged: row.pathChanged === true, ...(row.reason && { reason: String(row.reason) }) });
  }
  return [...latest.values()];
};

// IDs a later verdict can point at, numbered in the order the report lists its findings.
const numberFindings = (issues) => {
  let n = 0;
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    for (const finding of Array.isArray(issues?.[severity]) ? issues[severity] : []) {
      if (finding && typeof finding === 'object') finding.id = `F-${String(++n).padStart(2, '0')}`;
    }
  }
};

// A fix pointed at a file has to point at one in the folder the run started in.
const badFileFixes = (issues, cwd = process.cwd()) => ['critical', 'high', 'medium', 'low'].flatMap((severity) => (Array.isArray(issues?.[severity]) ? issues[severity] : []))
  .filter((finding) => finding?.fixAt?.kind === 'file')
  .flatMap(({ id, fixAt }) => {
    const file = path.resolve(cwd, String(fixAt.path ?? ''));
    if (!fixAt.path || path.isAbsolute(String(fixAt.path)) || !file.startsWith(cwd + path.sep)) return [`${id}: fixAt.path must be a path inside ${cwd}, relative to it`];
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [`${id}: no file at ${fixAt.path}`];
    const text = fs.readFileSync(file, 'utf8');
    // A final newline ends the last line rather than starting another.
    const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    return fixAt.line !== undefined && !(Number.isInteger(fixAt.line) && fixAt.line >= 1 && fixAt.line <= lines) ? [`${id}: ${fixAt.path} has ${lines} lines, not a line ${fixAt.line}`] : [];
  });

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
  const types = typesFor(flags, report);
  const performance = types.includes('performance');
  if (performance) report.pages = buildPages(entries);
  const functional = types.includes('functional');
  if (functional) {
    // Without a capture there's nothing to check visitedPages against, and the warning above says why.
    if (visitCount(entries)) report.inventory = buildInventory(entries);
    else delete report.inventory;
    report.linkChecks = readLinkChecks(recordFile(), started);
    numberFindings(report.issues);
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (functional) return mergedFunctional(report, entries);
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

const mergedFunctional = (report, entries) => {
  console.log(`Page inventory merged: ${report.inventory?.length ?? 0} page × viewport rows from ${visitCount(entries)} visits on ${host(report.url)}, and ${report.linkChecks.length} link check${report.linkChecks.length === 1 ? '' : 's'}`);
  const bad = badFileFixes(report.issues);
  if (bad.length) {
    console.error(`✗ A finding's fixAt names a file that isn't there:\n${bad.map((line) => `  ${line}`).join('\n')}\nUse kind "file" only for a file in the folder this run started in, or describe the fix in fixAt.detail with another kind.`);
    process.exitCode = 1;
  }
  // Only a fresh run is refused, as for performance: without a capture there's no inventory, and an old archive re-renders.
  if (report.inventory?.length && !report.provenance?.heldTo) {
    console.error(`✗ This run's browser wasn't held to ${host(report.url)}: the gate check (\`__kosh.gate\`) has to come back with both fields null on the first page, before any other is loaded, or nothing keeps the browser on the site. Close the browser with browser_close and run the skill again from the start.`);
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

// What functional's checks read from the inventory, small enough to print: each page's outline, then every link once, the site's own apart from the rest.
const inventoryView = (rows, site) => {
  const links = new Map();
  const pages = rows.map((row) => {
    for (const link of row.links ?? []) if (!links.has(link.href)) links.set(link.href, link.text);
    if (row.notRead) return { url: row.url, viewport: row.viewport, status: row.status, notRead: true };
    const headings = row.headings ?? [];
    return {
      url: row.url,
      viewport: row.viewport,
      status: row.status,
      title: row.title,
      counts: row.counts,
      h1: headings.filter((heading) => heading.tag === 'h1' && !heading.hidden).map((heading) => heading.text),
      headings: headings.map((heading) => `${heading.tag}${heading.hidden ? ' (hidden)' : ''}: ${heading.text}`),
      hiddenLinks: (row.links ?? []).filter((link) => link.hidden).length,
      imagesWithoutAlt: (row.images ?? []).filter((image) => image.alt === null).map((image) => image.src),
      meta: row.meta,
    };
  });
  const group = (test) => [...links].filter(([href]) => test(href)).map(([href, text]) => ({ text, href }));
  const web = (href) => /^https?:/i.test(href);
  return {
    pages,
    siteLinks: group((href) => web(href) && host(href) === host(site)),
    offSiteLinks: group((href) => web(href) && host(href) !== host(site)),
    otherLinks: group((href) => !web(href)),
  };
};

const inventory = ([site, ...urls]) => {
  const file = captureFile();
  const rows = buildInventory(reportEntries([...readEntries(takenFile(file)), ...readEntries(file)], site));
  console.log(JSON.stringify(inventoryView(rows, site), null, 2));
  const missing = uncovered([site, ...urls], rows);
  console.error(missing.length ? `No visit captured yet for: ${missing.join(', ')}` : 'Every page given has a captured visit.');
};

module.exports = { archiveText, badFileFixes, buildInventory, buildPages, host, inventoryView, numberFindings, readEntries, readLinkChecks, reportEntries, take, takenFile, uncovered, visitCount };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'merge' && args[0]) merge(args[0], args.slice(1));
  else if (command === 'summary' && host(args[0])) summary(args);
  else if (command === 'inventory' && host(args[0]) && args.every((url) => host(url))) inventory(args);
  else {
    console.error('Usage: node page-capture.js summary <site-url> [<page-url>…] | inventory <site-url> [<page-url>…] | merge <report.json> [--<type>]\nEvery URL is a full one, starting with https:// or http://.');
    process.exitCode = 1;
  }
}
