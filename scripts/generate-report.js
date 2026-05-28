#!/usr/bin/env node

/**
 * kosh report generator (HTML output)
 *
 * Reads a kosh JSON report (functional, performance, accessibility, or merged)
 * and emits a self-contained HTML file with inline CSS, color-coded severity,
 * collapsible sections, and inline screenshots when findings reference them.
 *
 * Usage:
 *   node generate-report.js <json-file> [--functional|--performance|--accessibility]
 *
 * The test-type flag affects the output filename. Design tokens (colors, fonts)
 * live in the TOKENS constant below — edit them there if the report's look needs
 * to change.
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || path.join(__dirname, '../reports/data/qa-report.json');
const args = process.argv.slice(3);

const testTypeLabel =
  args.includes('--functional')    ? 'FUNCTIONAL'
  : args.includes('--performance') ? 'PERFORMANCE'
  : args.includes('--accessibility') ? 'ACCESSIBILITY'
  : null;

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found at ${inputFile}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const escHtml = (val) =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escAttr = escHtml;

const getWebsiteName = (url) => {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  } catch {
    return 'Website';
  }
};

const websiteName = report.websiteName || getWebsiteName(report.url);
const environment = report.environment || 'unspecified';
const reportDate = report.timestamp ? new Date(report.timestamp).toLocaleString() : 'unknown';

const severities = ['critical', 'high', 'medium', 'low'];
const severityLabels = {
  critical: 'Critical',
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};
const severityCounts = Object.fromEntries(
  severities.map((s) => [s, (report.issues?.[s] || []).length])
);
const totalFindings = severities.reduce((sum, s) => sum + severityCounts[s], 0);

// Detect which skill data is present so the report title reflects what was actually run.
const hasPerformanceData = !!(report.mobile?.console || report.desktop?.console || report.mobile?.network || report.desktop?.network);
const hasAccessibilityData = !!(report.mobile?.a11y || report.desktop?.a11y);

let runTypesLabel;
if (testTypeLabel) {
  runTypesLabel = testTypeLabel.toLowerCase();
} else {
  const parts = [];
  if (hasPerformanceData) parts.push('performance');
  if (hasAccessibilityData) parts.push('accessibility');
  if (parts.length === 0) parts.push('functional');
  runTypesLabel = parts.join(' + ');
}

const renderScreenshots = (screenshots) => {
  if (!Array.isArray(screenshots) || screenshots.length === 0) return '';
  const figures = screenshots
    .map((relPath) => {
      const safePath = escAttr(relPath);
      const filename = relPath.split('/').pop();
      return `<figure class="screenshot"><a href="${safePath}" target="_blank" rel="noopener noreferrer"><img src="${safePath}" alt="${escAttr(filename)}" loading="lazy"></a><figcaption>${escHtml(filename)}</figcaption></figure>`;
    })
    .join('');
  return `<div class="screenshots">${figures}</div>`;
};

const renderPages = (pages) => {
  if (!Array.isArray(pages) || pages.length === 0) return '';
  const items = pages
    .map((p) => `<li><a href="${escAttr(p)}" target="_blank" rel="noopener noreferrer">${escHtml(p)}</a></li>`)
    .join('');
  return `<details class="pages"><summary>${pages.length} page${pages.length === 1 ? '' : 's'}</summary><ul>${items}</ul></details>`;
};

const renderFinding = (finding, index) => {
  const extraFields = [];
  if (finding.metric) extraFields.push(`<dt>Metric</dt><dd>${escHtml(finding.metric)}</dd>`);
  if (finding.wcag_criterion) extraFields.push(`<dt>WCAG</dt><dd>${escHtml(finding.wcag_criterion)}</dd>`);
  const extraDl = extraFields.length ? `<dl class="finding__extra">${extraFields.join('')}</dl>` : '';
  const device = finding.device ? `<span class="finding__device">${escHtml(finding.device)}</span>` : '';
  return `
    <article class="finding" id="finding-${index}">
      <header class="finding__header">
        <h4 class="finding__category">${escHtml(finding.category || 'Finding')}</h4>
        ${device}
      </header>
      <p class="finding__issue">${escHtml(finding.issue)}</p>
      <p class="finding__impact"><strong>Impact:</strong> ${escHtml(finding.impact)}</p>
      ${extraDl}
      ${renderPages(finding.pages)}
      ${renderScreenshots(finding.screenshots)}
    </article>
  `;
};

const renderSeverityBlock = (sev) => {
  const findings = report.issues?.[sev] || [];
  const count = findings.length;
  const label = severityLabels[sev];
  if (count === 0) {
    return `
      <section class="severity-block severity-block--${sev} severity-block--empty">
        <header class="severity-block__header">
          <h3>${label}</h3>
          <span class="severity-block__count">0</span>
        </header>
        <p class="severity-block__empty-message">No ${sev} findings.</p>
      </section>
    `;
  }
  const rendered = findings.map((f, i) => renderFinding(f, `${sev}-${i}`)).join('');
  return `
    <details class="severity-block severity-block--${sev}" open>
      <summary class="severity-block__header">
        <h3>${label}</h3>
        <span class="severity-block__count">${count}</span>
      </summary>
      <div class="severity-block__body">
        ${rendered}
      </div>
    </details>
  `;
};

const visitedPages = Array.isArray(report.visitedPages) ? report.visitedPages : [];
const visitedPagesList = visitedPages.length
  ? `<ul>${visitedPages.map((p) => `<li><a href="${escAttr(p)}" target="_blank" rel="noopener noreferrer">${escHtml(p)}</a></li>`).join('')}</ul>`
  : '<p class="muted">Not recorded.</p>';

const TOKENS = {
  bg: '#F8FAFC', surface: '#ffffff', border: '#E2E8F0',
  text: '#0F172A', muted: '#64748B', accent: '#7C3AED',
  sevCritical: '#E11D48', sevHigh: '#F97316', sevMedium: '#FBBF24', sevLow: '#0EA5E9',
  envProdBg: '#FECDD3', envProdFg: '#9F1239',
  envStagingBg: '#FDE68A', envStagingFg: '#854D0E',
  envDevBg: '#BAE6FD', envDevFg: '#075985',
  envUnspecBg: '#E2E8F0', envUnspecFg: '#64748B',
  fontBody: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontHeading: 'inherit',
};

const t = TOKENS;

const styles = `
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: ${t.bg};
    color: ${t.text};
    font-family: ${t.fontBody};
    font-size: 16px;
    line-height: 1.55;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: ${t.fontHeading};
  }
  a { color: ${t.accent}; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { text-decoration-thickness: 2px; }
  .wrap {
    max-width: 980px;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  header.report-head { margin-bottom: 1.5rem; }
  header.report-head h1 {
    font-size: 1.75rem;
    line-height: 1.2;
    margin: 0 0 0.25rem;
  }
  header.report-head .site-url {
    font-size: 1rem;
    color: ${t.muted};
    margin: 0 0 1rem;
    word-break: break-all;
  }
  dl.meta {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.5rem 1rem;
    margin: 0 0 1.5rem;
    font-size: 0.95rem;
    background: ${t.surface};
    border: 1px solid ${t.border};
    border-radius: 6px;
    padding: 0.875rem 1.125rem;
  }
  dl.meta dt {
    font-weight: 600;
    color: ${t.muted};
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    align-self: center;
  }
  dl.meta dd { margin: 0; align-self: center; }
  .env-tag {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .env-tag--production { background: ${t.envProdBg}; color: ${t.envProdFg}; }
  .env-tag--staging    { background: ${t.envStagingBg}; color: ${t.envStagingFg}; }
  .env-tag--development,
  .env-tag--local      { background: ${t.envDevBg}; color: ${t.envDevFg}; }
  .env-tag--unspecified { background: ${t.envUnspecBg}; color: ${t.envUnspecFg}; }
  .summary {
    margin-bottom: 2rem;
  }
  .summary h2 { font-size: 1.125rem; margin: 0 0 0.625rem; }
  .severity-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.625rem;
  }
  @media (max-width: 640px) {
    .severity-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .sev-card {
    border: 1px solid ${t.border};
    border-radius: 6px;
    padding: 0.875rem 1rem;
    background: ${t.surface};
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .sev-card--critical { border-left: 4px solid ${t.sevCritical}; }
  .sev-card--high     { border-left: 4px solid ${t.sevHigh}; }
  .sev-card--medium   { border-left: 4px solid ${t.sevMedium}; }
  .sev-card--low      { border-left: 4px solid ${t.sevLow}; }
  .sev-card__count {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
  }
  .sev-card__label {
    font-size: 0.875rem;
    color: ${t.muted};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .findings-section h2 {
    font-size: 1.125rem;
    margin: 0 0 1rem;
  }
  .severity-block {
    margin: 0 0 0.875rem;
    background: ${t.surface};
    border: 1px solid ${t.border};
    border-radius: 6px;
    overflow: hidden;
  }
  .severity-block--critical { border-left: 4px solid ${t.sevCritical}; }
  .severity-block--high     { border-left: 4px solid ${t.sevHigh}; }
  .severity-block--medium   { border-left: 4px solid ${t.sevMedium}; }
  .severity-block--low      { border-left: 4px solid ${t.sevLow}; }
  .severity-block__header {
    list-style: none;
    cursor: pointer;
    padding: 0.875rem 1.125rem;
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .severity-block__header::-webkit-details-marker { display: none; }
  .severity-block:not(.severity-block--empty) > .severity-block__header::after {
    content: "▾";
    color: ${t.muted};
    font-size: 0.875rem;
    transition: transform 0.15s ease;
  }
  .severity-block[open] > .severity-block__header::after {
    transform: rotate(180deg);
  }
  .severity-block__header h3 {
    margin: 0;
    margin-right: auto;
    font-size: 1rem;
    font-weight: 600;
  }
  .severity-block__count {
    font-size: 0.875rem;
    font-weight: 600;
    color: ${t.muted};
    padding: 0.125rem 0.625rem;
    background: ${t.bg};
    border-radius: 999px;
  }
  .severity-block--empty .severity-block__header { cursor: default; }
  .severity-block--empty .severity-block__empty-message {
    margin: 0;
    padding: 0 1.125rem 0.875rem;
    color: ${t.muted};
    font-size: 0.875rem;
    font-style: italic;
  }
  .severity-block__body {
    padding: 0 1.125rem 0.5rem;
  }
  .finding {
    border-top: 1px solid ${t.border};
    padding: 1rem 0;
  }
  .severity-block__body > .finding:first-child { border-top: none; padding-top: 0.25rem; }
  .finding__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
    flex-wrap: wrap;
  }
  .finding__category {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .finding__device {
    font-size: 0.75rem;
    color: ${t.muted};
    background: ${t.bg};
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .finding__issue {
    margin: 0.375rem 0;
    font-size: 0.95rem;
  }
  .finding__impact {
    margin: 0.375rem 0;
    font-size: 0.875rem;
    color: ${t.text};
  }
  .finding__extra {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.125rem 0.75rem;
    margin: 0.5rem 0;
    font-size: 0.8125rem;
  }
  .finding__extra dt { color: ${t.muted}; font-weight: 600; }
  .finding__extra dd { margin: 0; }
  details.pages {
    margin: 0.5rem 0;
    font-size: 0.8125rem;
  }
  details.pages summary {
    color: ${t.muted};
    cursor: pointer;
  }
  details.pages ul {
    margin: 0.375rem 0 0 1rem;
    padding: 0;
    word-break: break-all;
  }
  .screenshots {
    margin: 0.75rem 0 0.25rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.625rem;
  }
  .screenshot {
    margin: 0;
    border: 1px solid ${t.border};
    border-radius: 4px;
    background: ${t.bg};
    overflow: hidden;
  }
  .screenshot img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 320px;
    object-fit: cover;
  }
  .screenshot figcaption {
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    color: ${t.muted};
    border-top: 1px solid ${t.border};
    word-break: break-all;
  }
  .methodology {
    margin-top: 2rem;
    background: ${t.surface};
    border: 1px solid ${t.border};
    border-radius: 6px;
    padding: 1rem 1.125rem;
    font-size: 0.875rem;
  }
  .methodology h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .methodology p { margin: 0.5rem 0; }
  .visited-pages {
    margin-top: 1rem;
  }
  .visited-pages h3 { font-size: 0.875rem; margin: 0 0 0.375rem; color: ${t.muted}; text-transform: uppercase; letter-spacing: 0.04em; }
  .visited-pages ul {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.8125rem;
    word-break: break-all;
  }
  .muted { color: ${t.muted}; }
  footer.report-foot {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid ${t.border};
    font-size: 0.8125rem;
    color: ${t.muted};
  }
  footer.report-foot p { margin: 0.25rem 0; }
`;

const envTag = `<span class="env-tag env-tag--${escAttr(environment)}">${escHtml(environment)}</span>`;

const sevCards = severities
  .map((s) => `
    <div class="sev-card sev-card--${s}">
      <span class="sev-card__count">${severityCounts[s]}</span>
      <span class="sev-card__label">${severityLabels[s]}</span>
    </div>
  `)
  .join('');

const findingsBlocks = severities.map(renderSeverityBlock).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kosh ${escHtml(runTypesLabel)} QA report — ${escHtml(websiteName)}</title>
<style>${styles}</style>
</head>
<body>
<div class="wrap">
  <header class="report-head">
    <h1>kosh ${escHtml(runTypesLabel)} QA report — ${escHtml(websiteName)}</h1>
    <p class="site-url"><a href="${escAttr(report.url)}" target="_blank" rel="noopener noreferrer">${escHtml(report.url)}</a></p>
    <dl class="meta">
      <dt>Environment</dt><dd>${envTag}</dd>
      <dt>Test date</dt><dd>${escHtml(reportDate)}</dd>
      <dt>Findings</dt><dd>${totalFindings} total</dd>
      <dt>Pages tested</dt><dd>${visitedPages.length || '—'}</dd>
    </dl>
  </header>

  <section class="summary">
    <h2>Findings summary</h2>
    <div class="severity-grid">${sevCards}</div>
  </section>

  <section class="findings-section">
    <h2>Findings</h2>
    ${findingsBlocks}
  </section>

  <section class="methodology">
    <h2>Methodology</h2>
    <p>${escHtml(report.testMethodology || 'Not recorded.')}</p>
    <div class="visited-pages">
      <h3>Visited pages</h3>
      ${visitedPagesList}
    </div>
  </section>

  <footer class="report-foot">
    <p>Generated by kosh from <code>${escHtml(inputFile)}</code>.</p>
  </footer>
</div>
</body>
</html>
`;

const timestamp = report.timestamp ? new Date(report.timestamp).toISOString().split('T')[0] : 'undated';
const safeName = String(websiteName).toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_.-]/g, '');
const outputFilename = testTypeLabel
  ? `${safeName}_${testTypeLabel}_QA_REPORT_${timestamp}.html`
  : `${safeName}_QA_REPORT_${timestamp}.html`;
const reportsDir = path.join(__dirname, '../reports');

if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const outputPath = path.join(reportsDir, outputFilename);
fs.writeFileSync(outputPath, html);
console.log(`HTML report generated: ${outputPath}`);
