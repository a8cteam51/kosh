// Usage: node compare-runs.js <archived-performance-report.json>…   one block of rows per run, for comparing baselines
const fs = require('fs');
const path = require('path');

const schema = require('../schemas/qa-report-performance-schema.json');
const KNOWN = new Set([...Object.keys(schema.properties), 'mobile', 'desktop']);
const ANALYTICS = /google-analytics|googletagmanager|facebook|doubleclick|stats\.wp\.com/;

const short = (hash) => (typeof hash === 'string' ? hash.slice(0, 12) : '?');
const pathOf = (url) => String(url).replace(/^https?:\/\/[^/]+/, '') || '/';
const hostOf = (url) => {
  try { return new URL(url).host; } catch { return null; }
};
const num = (value, unit, digits = 0) => (typeof value === 'number' ? `${value.toFixed(digits)}${unit}` : '—');
const kb = (bytes) => num(typeof bytes === 'number' ? bytes / 1024 : null, ' KB');

const block = (file) => {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = report.provenance ?? {};
  const pages = Array.isArray(report.pages) ? report.pages : null;
  const urls = [...(report.visitedPages ?? []), ...(pages ?? []).map((page) => page.url)];
  const lines = [
    `=== ${path.basename(file)} — ${report.timestamp} — model ${p.model ?? '?'} — effort ${p.effort ?? '?'}`,
    `inputs: skill ${short(Object.values(p.skills ?? {})[0])} collectors ${short(p.collectors)} capture ${short(p.captureSha256)} mcp ${(p.playwrightMcp ?? ['?']).join(' ')}`,
    `hosts: ${[...new Set(urls.map(hostOf).filter(Boolean))].join(', ')}`,
    `invented keys: ${Object.keys(report).filter((key) => !KNOWN.has(key)).join(', ') || 'none'}`,
    'pages:',
    ...(report.visitedPages ?? []).map((url) => `  ${pathOf(url)}`),
  ];
  if (pages) {
    lines.push('measured:');
    for (const page of pages) {
      lines.push(`  ${pathOf(page.url)}\t${page.viewport ?? '?'}\tLCP ${num(typeof page.lcp === 'number' ? page.lcp / 1000 : null, ' s', 2)}\tCLS ${num(page.cls, '', 3)}${page.vitalsSettled === false ? '*' : ''}\tload ${num(page.loadTime, ' ms')}\thtml ${kb(page.transferSize)}\tfiles ${kb(page.resourceTransferSize)}\tconsole ${page.console.length}\tfailed ${page.network.length}${page.visits > 1 ? `\tvisits ${page.visits}` : ''}${page.loggedIn === true ? '\tlogged in' : ''}`);
    }
  } else {
    const viewport = (name) => `${name} ${report[name]?.loadTime}ms console=${report[name]?.console?.length} network=${report[name]?.network?.length}`;
    const rows = [...(report.desktop?.network ?? []), ...(report.mobile?.network ?? [])];
    const filtered = rows.filter((row) => ANALYTICS.test(row.url) || /^3/.test(String(row.status)) || /OPTIONS/i.test(row.type ?? ''));
    lines.push(`homepage: ${viewport('desktop')} | ${viewport('mobile')}`, `filter check (should be 0): analytics/3xx/OPTIONS in network: ${filtered.length}`);
  }
  lines.push('issues:');
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    for (const issue of report.issues?.[severity] ?? []) lines.push(`  ${severity}\t${issue.category}\t${(issue.pages ?? []).map(pathOf).join(',')}\t${issue.issue}`);
  }
  return lines.join('\n');
};

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node compare-runs.js <archived-performance-report.json>…');
  process.exitCode = 1;
} else {
  console.log(files.map(block).join('\n\n'));
}
