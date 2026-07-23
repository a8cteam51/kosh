#!/usr/bin/env node

/**
 * kosh report generator (HTML output)
 *
 * Reads a kosh JSON report (functional, performance, accessibility, shop, AEO,
 * or merged) and emits a self-contained HTML file with inline CSS, color-coded
 * severity, collapsible sections, and inline screenshots when findings reference them.
 *
 * Usage:
 *   node generate-report.js <json-file> [--functional|--performance|--accessibility|--shop|--aeo]
 *
 * AEO reports are auto-detected from `report.mode === "aeo"`; --aeo forces the
 * AEO branch explicitly. The test-type flag affects the output filename.
 * Design tokens (colors, fonts) live in the TOKENS constant below — edit them
 * there if the report's look needs to change.
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || path.join(__dirname, '../reports/data/qa-report.json');
const args = process.argv.slice(3);

const testTypeLabel =
  args.includes('--functional')    ? 'FUNCTIONAL'
  : args.includes('--performance') ? 'PERFORMANCE'
  : args.includes('--accessibility') ? 'ACCESSIBILITY'
  : args.includes('--shop') ? 'SHOP'
  : args.includes('--aeo') ? 'AEO'
  : null;

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found at ${inputFile}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// ===== Shared helpers (used by both QA renderer and renderAeoReport) =====

const escHtml = (val) =>
  String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escAttr = escHtml;

// sanitizeHref returns the input only if it parses as a safe href:
// - http:// or https:// schemes
// - relative paths, fragments, no-scheme URLs (no colon-scheme prefix)
// Anything else (javascript:, data:, vbscript:, file:, etc.) returns null.
// Used by renderLink to render plain text when an href is unsafe so we never
// produce an anchor that could execute script.
const sanitizeHref = (value) => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const schemeMatch = str.match(/^([a-z][a-z0-9+\-.]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    return (scheme === 'http' || scheme === 'https') ? str : null;
  }
  return str; // relative path, fragment, or scheme-less — safe
};

// renderLink emits a safe <a> when the href passes the scheme whitelist,
// or escaped plain text otherwise. Both arguments come from report data,
// so we treat them as untrusted.
const renderLink = (href, text) => {
  const display = text != null ? text : href;
  const safe = sanitizeHref(href);
  if (!safe) return escHtml(display ?? '');
  return `<a href="${escAttr(safe)}" target="_blank" rel="noopener noreferrer">${escHtml(display)}</a>`;
};

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
// Default to 'production' to match the AEO schema's documented default and
// the kosh skills' own behavior. The QA renderer also writes this through
// the env-tag CSS; the .env-tag--production class exists for both paths.
const environment = report.environment || 'production';
const reportDate = report.timestamp ? new Date(report.timestamp).toLocaleString() : 'unknown';

// ===== Dispatch =====
//
// AEO reports use a different data shape (criteria/signals/applicableSchemas,
// no mobile/desktop blocks). Dispatch is explicit and validated:
//   * `--aeo` forces the AEO renderer.
//   * `report.mode === "aeo"` auto-routes to the AEO renderer.
//   * An AEO-shaped report missing `mode` produces a loud error rather than
//     silently rendering through the functional path.
//   * Non-AEO flags on an AEO report (or vice versa) error.
//
// renderAeoReport is a hoisted function declaration at the bottom of this file.

const aeoFlagSet = args.includes('--aeo');
const qaFlagSet = args.some((a) => ['--functional', '--performance', '--accessibility', '--shop'].includes(a));
const modeIsAeo = report.mode === 'aeo';
const looksLikeAeo =
  modeIsAeo ||
  (report.criteria && typeof report.criteria === 'object' &&
   ['technicalHealth', 'structuredData', 'aeoReadiness'].every((k) => k in report.criteria));

if (aeoFlagSet && qaFlagSet) {
  console.error('Error: --aeo cannot be combined with --functional / --performance / --accessibility / --shop.');
  process.exit(1);
}
if (aeoFlagSet && !looksLikeAeo) {
  console.error('Error: --aeo flag set but the report shape is not AEO (no `mode: "aeo"` and no AEO-shaped `criteria` block). Refusing to produce a misleading empty report.');
  process.exit(1);
}
if (looksLikeAeo && qaFlagSet) {
  console.error('Error: report appears to be AEO-shaped, but a non-AEO flag was passed. Did you mean --aeo?');
  process.exit(1);
}
if (looksLikeAeo && !modeIsAeo) {
  console.error('Error: report has AEO-shaped `criteria` but is missing `mode: "aeo"`. Add the field or pass --aeo to force.');
  process.exit(1);
}
if (modeIsAeo || aeoFlagSet) {
  renderAeoReport(report, inputFile, testTypeLabel);
  process.exit(0);
}

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
const hasShopData = !!report.shop;

let runTypesLabel;
if (testTypeLabel) {
  runTypesLabel = testTypeLabel.toLowerCase();
} else {
  const parts = [];
  if (hasPerformanceData) parts.push('performance');
  if (hasAccessibilityData) parts.push('accessibility');
  if (hasShopData) parts.push('shop');
  if (parts.length === 0) parts.push('functional');
  runTypesLabel = parts.join(' + ');
}

const renderScreenshots = (screenshots) => {
  if (!Array.isArray(screenshots) || screenshots.length === 0) return '';
  const figures = screenshots
    .map((relPath) => {
      const safePath = escAttr(relPath);
      const filename = relPath.split('/').pop();
      const safeHref = sanitizeHref(relPath);
      const imgTag = `<img src="${escAttr(safePath)}" alt="${escAttr(filename)}" loading="lazy">`;
      const anchor = safeHref
        ? `<a href="${escAttr(safeHref)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`
        : imgTag;
      return `<figure class="screenshot">${anchor}<figcaption>${escHtml(filename)}</figcaption></figure>`;
    })
    .join('');
  return `<div class="screenshots">${figures}</div>`;
};

const renderPages = (pages) => {
  if (!Array.isArray(pages) || pages.length === 0) return '';
  const items = pages
    .map((p) => `<li>${renderLink(p)}</li>`)
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

const CHECK_OUTCOMES = {
  'no-issue': 'No issue',
  'finding-raised': 'Finding raised',
  inconclusive: 'Inconclusive',
  'out-of-scope': 'Out of scope',
  unknown: 'Recorded',
};

const renderCheck = (check) => {
  const outcome = check.outcome in CHECK_OUTCOMES ? check.outcome : 'unknown';
  const area = check.area ? `<span class="check__area">${escHtml(check.area)}</span>` : '';
  const referred = check.referredTo
    ? `<p class="check__referred">Run <code>${escHtml(check.referredTo)}</code> to investigate this</p>`
    : '';
  return `
    <article class="check">
      <header class="check__header">
        <span class="check__outcome check__outcome--${outcome}">${escHtml(CHECK_OUTCOMES[outcome])}</span>
        ${area}
      </header>
      <p class="check__what">${escHtml(check.check)}</p>
      <p class="check__detail">${escHtml(check.detail)}</p>
      ${referred}
    </article>
  `;
};

const explorationPass = Array.isArray(report.explorationPass) ? report.explorationPass : [];
// Clean results are coverage evidence, not action items: collapse them, keep the rest open.
const cleanChecks = explorationPass.filter((c) => c.outcome === 'no-issue');
const notableChecks = explorationPass.filter((c) => c.outcome !== 'no-issue');
const cleanChecksBlock = cleanChecks.length
  ? `
    <details class="exploration__clean">
      <summary class="exploration__clean-summary">${cleanChecks.length} check${cleanChecks.length === 1 ? '' : 's'} found no issue</summary>
      <div class="exploration__grid exploration__clean-body">${cleanChecks.map(renderCheck).join('')}</div>
    </details>`
  : '';
const explorationSection = explorationPass.length
  ? `
  <section class="exploration">
    <h2>Exploration pass</h2>
    <p class="exploration__intro">Threads investigated beyond the findings above, recorded whatever the outcome — so a reader can tell the difference between a surface that was checked and found clean, and one nobody looked at.</p>
    ${notableChecks.length ? `<div class="exploration__grid">${notableChecks.map(renderCheck).join('')}</div>` : ''}
    ${cleanChecksBlock}
  </section>`
  : '';

const visitedPages = Array.isArray(report.visitedPages) ? report.visitedPages : [];
const visitedPagesList = visitedPages.length
  ? `<ul>${visitedPages.map((p) => `<li>${renderLink(p)}</li>`).join('')}</ul>`
  : '<p class="muted">Not recorded.</p>';

const TOKENS = {
  bg: '#F8FAFC', surface: '#ffffff', border: '#E2E8F0',
  text: '#0F172A', muted: '#64748B', accent: '#7C3AED',
  sevCritical: '#E11D48', sevHigh: '#F97316', sevMedium: '#FBBF24', sevLow: '#0EA5E9',
  envProdBg: '#FECDD3', envProdFg: '#9F1239',
  envStagingBg: '#FDE68A', envStagingFg: '#854D0E',
  envDevBg: '#BAE6FD', envDevFg: '#075985',
  envUnspecBg: '#E2E8F0', envUnspecFg: '#64748B',
  checkOkBg: '#DCFCE7', checkOkFg: '#166534',
  checkRaisedBg: '#FFE4E6', checkRaisedFg: '#9F1239',
  checkOpenBg: '#FEF3C7', checkOpenFg: '#854D0E',
  checkScopeBg: '#E0E7FF', checkScopeFg: '#3730A3',
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
  .env-tag,
  .check__outcome {
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
  .exploration { margin-bottom: 2rem; }
  .exploration h2 { font-size: 1.125rem; margin: 0 0 0.375rem; }
  .exploration__intro { margin: 0 0 0.875rem; color: ${t.muted}; font-size: 0.9375rem; max-width: 68ch; }
  .exploration__grid { display: grid; gap: 0.625rem; }
  .check {
    background: ${t.surface};
    border: 1px solid ${t.border};
    border-radius: 6px;
    padding: 0.875rem 1rem;
  }
  .check__header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .check__outcome--no-issue       { background: ${t.checkOkBg}; color: ${t.checkOkFg}; }
  .check__outcome--finding-raised { background: ${t.checkRaisedBg}; color: ${t.checkRaisedFg}; }
  .check__outcome--inconclusive   { background: ${t.checkOpenBg}; color: ${t.checkOpenFg}; }
  .check__outcome--out-of-scope   { background: ${t.checkScopeBg}; color: ${t.checkScopeFg}; }
  .check__outcome--unknown        { background: ${t.envUnspecBg}; color: ${t.envUnspecFg}; }
  .check__area { font-size: 0.8125rem; color: ${t.muted}; font-weight: 600; }
  .check__what { margin: 0 0 0.375rem; font-weight: 600; }
  .check__detail { margin: 0; color: ${t.muted}; font-size: 0.9375rem; }
  .check__referred { margin: 0.5rem 0 0; font-size: 0.875rem; }
  .check__referred code { background: ${t.bg}; padding: 0.0625rem 0.3125rem; border-radius: 4px; }
  .exploration__clean { margin-top: 0.625rem; }
  .exploration__clean-summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    background: ${t.surface};
    border: 1px solid ${t.border};
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    color: ${t.muted};
  }
  .exploration__clean-summary::-webkit-details-marker { display: none; }
  .exploration__clean-summary::after {
    content: "▾";
    transition: transform 0.15s ease;
  }
  .exploration__clean[open] > .exploration__clean-summary::after { transform: rotate(180deg); }
  .exploration__clean-summary:hover { color: ${t.text}; }
  .exploration__clean-body { margin-top: 0.625rem; }
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
    <p class="site-url">${renderLink(report.url)}</p>
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
${explorationSection}
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

// ============================================================
// AEO renderer (HTML output)
// Self-contained: declares its own helpers, extended TOKENS, and styles.
// Consumes the descored AEO report shape — see schemas/qa-report-aeo-schema.json
// and skills/aeo/SKILL.md.
// ============================================================

function renderAeoReport(aeoReport, aeoInputFile, cliTestTypeLabel) {
  // escHtml, escAttr, getWebsiteName, websiteName, environment, reportDate are
  // module-level closures hoisted above the dispatch — see top of file.

  const CRITERION_ORDER = [
    ['technicalHealth',    'Technical Health'],
    ['structuredData',     'Structured Data'],
    ['aeoReadiness',       'AEO Readiness'],
    ['eeatSignals',        'E-E-A-T Signals'],
    ['contentFreshness',   'Content Freshness'],
    ['entityClarity',      'Entity Clarity'],
    ['contentSpecificity', 'Content Specificity'],
    ['llmsTxt',            'llms.txt'],
  ];

  // Lookup so the issue badges + actionable-prompts summaries render the same
  // pretty label the criterion section header uses (e.g. "Structured Data"
  // instead of the raw camelCase "structuredData" key).
  const criterionLabelMap = Object.fromEntries(CRITERION_ORDER);
  const criterionLabel = (key) => criterionLabelMap[key] || key;

  const SIGNAL_LABELS = {
    robotsAndCrawlerAccess: 'robots.txt and AI crawler access',
    noNoindex: 'No noindex on homepage',
    httpsNoMixedContent: 'HTTPS, no mixed content',
    sitemapLastmod: 'Sitemap with valid lastmod dates',
    nojsAccessible: 'Core content accessible without JavaScript',
    canonicalUrls: 'Canonical URLs on homepage and inner pages',
    organizationSchema: 'Organization schema',
    primaryEntitySchema: 'Primary entity schema (content-driven)',
    relevantSchemasApplied: 'Relevant schemas applied (coverage)',
    faqSchema: 'FAQ schema',
    jsonLdFormat: 'Structured-data format (JSON-LD / microdata / RDFa)',
    openGraphTags: 'Open Graph tags complete',
    reviewSchema: 'Review or AggregateRating schema',
    directAnswers: 'Direct answers after headings',
    whoWhatWho: 'Who / what / who content',
    featuredSnippetStructure: 'Featured snippet structure',
    answerCapsules: 'Answer capsules (40–60 words under H2/H3)',
    faqSectionPresent: 'FAQ section present',
    faqSchemaApplied: 'FAQ schema applied',
    questionFramedHeadings: 'Question-framed headings',
    titleAndMetaQuestionMatch: 'Title and meta question-match',
    namedTeamMembers: 'Named individuals with roles',
    authorCredentials: 'Author / staff credentials',
    authorBylines: 'Author bylines with Person schema',
    demonstratedExpertise: 'Demonstrated expertise',
    externalCitations: 'External citations or press',
    certificationBadges: 'Credentialing badges',
    namedExternalRelationships: 'Named external relationships',
    tenureIndicators: 'Tenure indicators',
    copyrightYearCurrent: 'Copyright year current',
    blogNewsRecent: 'Blog / news / featured content (last 6 months)',
    dateStampsOnContent: 'Date stamps on posts or featured items',
    contentUpdateRecency: 'Per-page "Last updated" stamps (last 12 months)',
    sitemapLastmodRecent: 'Sitemap lastmod dates recent',
    recentFeaturedWork: 'Recent featured work',
    currentDomainReferences: 'Current domain references',
    entityIdentifiable: 'Named entity identifiable in one sentence',
    primaryFocusSpecificity: 'Primary focus specificity',
    socialProfileLinks: 'Social profile links in footer',
    geographicMarketClarity: 'Geographic or market clarity',
    consistentIdentity: 'Consistent identity signals',
    primaryOfferingDetail: 'Primary offering detail (what, who, outcome)',
    namedSpecificEntities: 'Named specific entities',
    namedSubjectAreas: 'Named subject areas',
    specificOutcomes: 'Specific outcomes or quantified results',
    passageExtractionQuality: 'Passage extraction quality',
    llmsTxtPresent: 'llms.txt present',
    llmsFullTxtPresent: 'llms-full.txt present',
    llmsTxtContent: 'llms.txt content accurate and specific',
  };

  const SITE_TYPE_LABELS = {
    agency: 'Agency / Service Business',
    ecommerce: 'Ecommerce',
    mediaBlog: 'Media / Blog',
    saas: 'SaaS / Software',
    education: 'Education',
    localBusiness: 'Local Business',
    nonprofit: 'Nonprofit',
    community: 'Community',
    other: 'Other / Unknown',
  };

  const STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    na: 'N/A',
  };

  const signalLabel = (key) => SIGNAL_LABELS[key] || key;
  const siteTypeLabel = SITE_TYPE_LABELS[aeoReport.siteType] || aeoReport.siteType || 'Other / Unknown';
  const summary = aeoReport.summary || { totalSignals: 0, pass: 0, partial: 0, fail: 0, na: 0 };

  // Visual tokens (extends trunk style; AEO adds pass green, plus reuses sev colors for partial/fail/na pills)
  const T = {
    bg: '#F8FAFC', surface: '#ffffff', border: '#E2E8F0',
    text: '#0F172A', muted: '#64748B', accent: '#7C3AED',
    sevCritical: '#E11D48', sevHigh: '#F97316', sevMedium: '#FBBF24', sevLow: '#0EA5E9',
    // Status colors are tuned to meet WCAG AA contrast (≥4.5:1) in BOTH
    // contexts: white text on the pill background, and the same value used as
    // text on the light .criterion__counts chip background (T.bg). See the
    // contrast table in the PR description for the verified ratios.
    statusPass: '#15803D', statusPartial: '#B45309', statusFail: '#BE123C', statusNa: '#475569',
    envProdBg: '#FECDD3', envProdFg: '#9F1239',
    envStagingBg: '#FDE68A', envStagingFg: '#854D0E',
    envDevBg: '#BAE6FD', envDevFg: '#075985',
    envUnspecBg: '#E2E8F0', envUnspecFg: '#64748B',
    relevanceHighBg: '#DCFCE7', relevanceHighFg: '#166534',
    relevanceMediumBg: '#FEF9C3', relevanceMediumFg: '#854D0E',
    relevanceLowBg: '#E2E8F0', relevanceLowFg: '#475569',
    // relevanceAbsentFg darkened from '#94A3B8' (2.62:1 on absent bg) to meet AA.
    relevanceAbsentBg: '#F1F5F9', relevanceAbsentFg: '#475569',
    fontBody: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontHeading: 'inherit',
  };

  const styles = `
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      background: ${T.bg};
      color: ${T.text};
      font-family: ${T.fontBody};
      font-size: 16px;
      line-height: 1.55;
    }
    h1, h2, h3, h4, h5, h6 { font-family: ${T.fontHeading}; }
    a { color: ${T.accent}; text-decoration: underline; text-underline-offset: 2px; }
    a:hover { text-decoration-thickness: 2px; }
    code { background: ${T.bg}; padding: 0.0625rem 0.375rem; border-radius: 3px; font-size: 0.875em; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    header.report-head { margin-bottom: 1.5rem; }
    header.report-head h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 0.25rem; }
    header.report-head .site-url { font-size: 1rem; color: ${T.muted}; margin: 0 0 1rem; word-break: break-all; }
    dl.meta {
      display: grid; grid-template-columns: max-content 1fr; gap: 0.5rem 1rem;
      margin: 0 0 1.5rem; font-size: 0.95rem;
      background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 6px;
      padding: 0.875rem 1.125rem;
    }
    dl.meta dt {
      font-weight: 600; color: ${T.muted}; text-transform: uppercase;
      font-size: 0.75rem; letter-spacing: 0.04em; align-self: center;
    }
    dl.meta dd { margin: 0; align-self: center; }
    .env-tag {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 999px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    }
    .env-tag--production { background: ${T.envProdBg}; color: ${T.envProdFg}; }
    .env-tag--staging    { background: ${T.envStagingBg}; color: ${T.envStagingFg}; }
    .env-tag--development, .env-tag--local { background: ${T.envDevBg}; color: ${T.envDevFg}; }
    .env-tag--unspecified { background: ${T.envUnspecBg}; color: ${T.envUnspecFg}; }
    .site-type {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 999px;
      background: ${T.bg}; color: ${T.text}; font-size: 0.75rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .site-type__confidence { color: ${T.muted}; font-weight: 500; text-transform: none; letter-spacing: 0; }
    .rationale { color: ${T.muted}; font-style: italic; font-size: 0.9em; }

    .summary { margin-bottom: 2rem; }
    .summary h2 { font-size: 1.125rem; margin: 0 0 0.625rem; }

    .status-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.625rem; margin-bottom: 1rem;
    }
    @media (max-width: 640px) { .status-grid { grid-template-columns: repeat(2, 1fr); } }
    .status-card {
      border: 1px solid ${T.border}; border-radius: 6px; padding: 0.875rem 1rem;
      background: ${T.surface}; display: flex; flex-direction: column; gap: 0.125rem;
    }
    .status-card--pass    { border-left: 4px solid ${T.statusPass}; }
    .status-card--partial { border-left: 4px solid ${T.statusPartial}; }
    .status-card--fail    { border-left: 4px solid ${T.statusFail}; }
    .status-card--na      { border-left: 4px solid ${T.statusNa}; }
    .status-card__count { font-size: 1.75rem; font-weight: 700; line-height: 1; }
    .status-card__label { font-size: 0.875rem; color: ${T.muted}; text-transform: uppercase; letter-spacing: 0.04em; }

    .severity-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.625rem; }
    @media (max-width: 640px) { .severity-grid { grid-template-columns: repeat(2, 1fr); } }
    .sev-card {
      border: 1px solid ${T.border}; border-radius: 6px; padding: 0.875rem 1rem;
      background: ${T.surface}; display: flex; flex-direction: column; gap: 0.125rem;
    }
    .sev-card--critical { border-left: 4px solid ${T.sevCritical}; }
    .sev-card--high     { border-left: 4px solid ${T.sevHigh}; }
    .sev-card--medium   { border-left: 4px solid ${T.sevMedium}; }
    .sev-card--low      { border-left: 4px solid ${T.sevLow}; }
    .sev-card__count { font-size: 1.75rem; font-weight: 700; line-height: 1; }
    .sev-card__label { font-size: 0.875rem; color: ${T.muted}; text-transform: uppercase; letter-spacing: 0.04em; }

    .criterion {
      margin: 0 0 0.875rem; background: ${T.surface}; border: 1px solid ${T.border};
      border-radius: 6px; overflow: hidden;
    }
    .criterion__header {
      list-style: none; cursor: pointer; padding: 0.875rem 1.125rem;
      display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap;
    }
    .criterion__header::-webkit-details-marker { display: none; }
    .criterion > .criterion__header::after {
      content: "▾"; color: ${T.muted}; font-size: 0.875rem; transition: transform 0.15s ease;
    }
    .criterion[open] > .criterion__header::after { transform: rotate(180deg); }
    .criterion__title { margin: 0; margin-right: auto; font-size: 1rem; font-weight: 600; }
    .criterion__counts { font-size: 0.8125rem; color: ${T.muted}; display: flex; gap: 0.375rem; }
    .criterion__counts span { padding: 0.0625rem 0.375rem; border-radius: 4px; background: ${T.bg}; }
    .criterion__counts .pass-count { color: ${T.statusPass}; }
    .criterion__counts .partial-count { color: ${T.statusPartial}; }
    .criterion__counts .fail-count { color: ${T.statusFail}; }
    .criterion__counts .na-count { color: ${T.statusNa}; }
    .criterion__body { padding: 0 1.125rem 0.875rem; }
    .signal-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .signal-table th, .signal-table td {
      border-top: 1px solid ${T.border}; padding: 0.5rem 0.5rem; text-align: left; vertical-align: top;
    }
    .signal-table th {
      font-weight: 600; color: ${T.muted}; text-transform: uppercase;
      font-size: 0.6875rem; letter-spacing: 0.04em; border-top: none;
    }
    .signal-table tr:first-child td { border-top: none; }
    .signal-table .signal-name { font-weight: 500; }
    .signal-table .signal-notes { color: ${T.text}; }
    .status-pill {
      display: inline-block; padding: 0.0625rem 0.5rem; border-radius: 999px;
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      color: #fff;
    }
    /* White text on each darker palette token; AA contrast verified for all four. */
    .status-pill--pass    { background: ${T.statusPass}; }
    .status-pill--partial { background: ${T.statusPartial}; }
    .status-pill--fail    { background: ${T.statusFail}; }
    .status-pill--na      { background: ${T.statusNa}; }
    .status-pill--unknown { background: ${T.statusNa}; }

    .schema-relevance { margin: 1rem 0 2rem; }
    .schema-relevance h2 { font-size: 1.125rem; margin: 0 0 0.5rem; }
    .schema-relevance p.muted { margin: 0 0 0.75rem; font-size: 0.875rem; }
    .relevance-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 6px; overflow: hidden; }
    .relevance-table td { padding: 0.5rem 0.875rem; border-top: 1px solid ${T.border}; }
    .relevance-table tr:first-child td { border-top: none; }
    .relevance-table .schema-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem; }
    .relevance-pill {
      display: inline-block; padding: 0.0625rem 0.5rem; border-radius: 999px;
      font-size: 0.75rem; font-weight: 600;
    }
    .relevance-pill--high    { background: ${T.relevanceHighBg}; color: ${T.relevanceHighFg}; }
    .relevance-pill--medium  { background: ${T.relevanceMediumBg}; color: ${T.relevanceMediumFg}; }
    .relevance-pill--low     { background: ${T.relevanceLowBg}; color: ${T.relevanceLowFg}; }
    .relevance-pill--absent  { background: ${T.relevanceAbsentBg}; color: ${T.relevanceAbsentFg}; }

    .findings-section h2 { font-size: 1.125rem; margin: 0 0 1rem; }
    .severity-block {
      margin: 0 0 0.875rem; background: ${T.surface}; border: 1px solid ${T.border};
      border-radius: 6px; overflow: hidden;
    }
    .severity-block--critical { border-left: 4px solid ${T.sevCritical}; }
    .severity-block--high     { border-left: 4px solid ${T.sevHigh}; }
    .severity-block--medium   { border-left: 4px solid ${T.sevMedium}; }
    .severity-block--low      { border-left: 4px solid ${T.sevLow}; }
    .severity-block__header {
      list-style: none; cursor: pointer; padding: 0.875rem 1.125rem;
      display: flex; align-items: center; gap: 0.625rem;
    }
    .severity-block__header::-webkit-details-marker { display: none; }
    .severity-block:not(.severity-block--empty) > .severity-block__header::after {
      content: "▾"; color: ${T.muted}; font-size: 0.875rem; transition: transform 0.15s ease;
    }
    .severity-block[open] > .severity-block__header::after { transform: rotate(180deg); }
    .severity-block__header h3 { margin: 0; margin-right: auto; font-size: 1rem; font-weight: 600; }
    .severity-block__count {
      font-size: 0.875rem; font-weight: 600; color: ${T.muted};
      padding: 0.125rem 0.625rem; background: ${T.bg}; border-radius: 999px;
    }
    .severity-block--empty .severity-block__header { cursor: default; }
    .severity-block--empty .severity-block__empty-message {
      margin: 0; padding: 0 1.125rem 0.875rem; color: ${T.muted}; font-size: 0.875rem; font-style: italic;
    }
    .severity-block__body { padding: 0 1.125rem 0.5rem; }
    .finding { border-top: 1px solid ${T.border}; padding: 1rem 0; }
    .severity-block__body > .finding:first-child { border-top: none; padding-top: 0.25rem; }
    .finding__header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
    .finding__signal { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .finding__criterion {
      font-size: 0.75rem; color: ${T.muted}; background: ${T.bg};
      padding: 0.125rem 0.5rem; border-radius: 999px;
    }
    .finding__issue { margin: 0.375rem 0; font-size: 0.95rem; }
    .finding__impact { margin: 0.375rem 0; font-size: 0.875rem; color: ${T.text}; }
    .finding__effort { margin: 0.375rem 0; font-size: 0.8125rem; color: ${T.muted}; }
    .finding__effort .effort-tag {
      display: inline-block; padding: 0.0625rem 0.4375rem; border-radius: 999px;
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      font-size: 0.6875rem; background: ${T.bg}; color: ${T.text}; margin-right: 0.375rem;
    }

    .actionable-prompts { margin-top: 2rem; }
    .actionable-prompts h2 { font-size: 1.125rem; margin: 0 0 0.5rem; }
    .actionable-prompts p.muted { margin: 0 0 1rem; font-size: 0.875rem; }
    .prompt-block {
      margin: 0 0 1rem; background: ${T.surface}; border: 1px solid ${T.border};
      border-radius: 6px; padding: 0.875rem 1.125rem;
    }
    .prompt-block summary { cursor: pointer; font-weight: 600; font-size: 0.95rem; }
    .prompt-block__body { margin-top: 0.625rem; font-size: 0.875rem; }
    .prompt-block__body p { margin: 0.375rem 0; }
    .prompt-block__prompt {
      background: ${T.bg}; border: 1px solid ${T.border}; border-radius: 4px;
      padding: 0.625rem 0.75rem; margin-top: 0.5rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem;
      white-space: pre-wrap; word-break: break-word;
    }

    .methodology {
      margin-top: 2rem; background: ${T.surface}; border: 1px solid ${T.border};
      border-radius: 6px; padding: 1rem 1.125rem; font-size: 0.875rem;
    }
    .methodology h2 { font-size: 1rem; margin: 0 0 0.5rem; }
    .methodology p { margin: 0.5rem 0; }
    .visited-pages { margin-top: 1rem; }
    .visited-pages h3 {
      font-size: 0.875rem; margin: 0 0 0.375rem; color: ${T.muted};
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .visited-pages ul { margin: 0; padding-left: 1rem; font-size: 0.8125rem; word-break: break-all; }
    .muted { color: ${T.muted}; }
    footer.report-foot {
      margin-top: 2rem; padding-top: 1rem; border-top: 1px solid ${T.border};
      font-size: 0.8125rem; color: ${T.muted};
    }
    footer.report-foot p { margin: 0.25rem 0; }
  `;

  const envTag = `<span class="env-tag env-tag--${escAttr(environment)}">${escHtml(environment)}</span>`;

  const siteTypeTag = `<span class="site-type">${escHtml(siteTypeLabel)}${aeoReport.siteTypeConfidence
    ? ` <span class="site-type__confidence">(${escHtml(aeoReport.siteTypeConfidence)})</span>`
    : ''}</span>${aeoReport.siteTypeRationale ? ` <span class="rationale">— ${escHtml(aeoReport.siteTypeRationale)}</span>` : ''}`;

  // Status summary cards (pass / partial / fail / na)
  const statusCards = ['pass', 'partial', 'fail', 'na']
    .map((s) => `
      <div class="status-card status-card--${s}">
        <span class="status-card__count">${summary[s] || 0}</span>
        <span class="status-card__label">${STATUS_LABELS[s]}</span>
      </div>
    `)
    .join('');

  // Severity summary cards (critical / high / medium / low)
  const severities = ['critical', 'high', 'medium', 'low'];
  const severityLabels = { critical: 'Critical', high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
  const severityCounts = Object.fromEntries(
    severities.map((s) => [s, (aeoReport.issues?.[s] || []).length])
  );
  const sevCards = severities.map((s) => `
    <div class="sev-card sev-card--${s}">
      <span class="sev-card__count">${severityCounts[s]}</span>
      <span class="sev-card__label">${severityLabels[s]}</span>
    </div>
  `).join('');

  // Per-criterion sections with signal status tables
  const renderCriterionBlock = ([key, label]) => {
    const c = aeoReport.criteria?.[key];
    if (!c) return '';
    const signals = c.signals || {};
    const signalKeys = Object.keys(signals);
    const counts = { pass: 0, partial: 0, fail: 0, na: 0 };
    signalKeys.forEach((k) => {
      const st = signals[k] && signals[k].status;
      if (counts[st] !== undefined) counts[st]++;
    });

    const headerCounts = `
      <span class="criterion__counts">
        <span class="pass-count">${counts.pass} pass</span>
        <span class="partial-count">${counts.partial} partial</span>
        <span class="fail-count">${counts.fail} fail</span>
        ${counts.na ? `<span class="na-count">${counts.na} N/A</span>` : ''}
      </span>
    `;

    if (signalKeys.length === 0) {
      return `
        <details class="criterion" open>
          <summary class="criterion__header">
            <h3 class="criterion__title">${escHtml(label)}</h3>
            ${headerCounts}
          </summary>
          <div class="criterion__body"><p class="muted">No signal data recorded.</p></div>
        </details>
      `;
    }

    const VALID_STATUSES = new Set(['pass', 'partial', 'fail', 'na']);
    const rows = signalKeys.map((sk) => {
      const sig = signals[sk] || {};
      const status = VALID_STATUSES.has(sig.status) ? sig.status : 'unknown';
      return `
        <tr>
          <td class="signal-name">${escHtml(signalLabel(sk))}</td>
          <td><span class="status-pill status-pill--${escAttr(status)}">${escHtml(STATUS_LABELS[status] || status)}</span></td>
          <td class="signal-notes">${escHtml(sig.notes || '—')}</td>
        </tr>
      `;
    }).join('');

    return `
      <details class="criterion" open>
        <summary class="criterion__header">
          <h3 class="criterion__title">${escHtml(label)}</h3>
          ${headerCounts}
        </summary>
        <div class="criterion__body">
          <table class="signal-table">
            <thead>
              <tr><th>Signal</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>
    `;
  };
  const criteriaBlocks = CRITERION_ORDER.map(renderCriterionBlock).join('');

  // Schema relevance table
  const applicableSchemas = aeoReport.technicalNotes?.applicableSchemas || {};
  const relevanceOrder = { high: 0, medium: 1, low: 2, absent: 3 };
  const relevanceLabels = { high: 'High', medium: 'Medium', low: 'Low', absent: 'Absent' };
  const relevanceRows = Object.entries(applicableSchemas)
    .sort((a, b) => (relevanceOrder[a[1]] ?? 9) - (relevanceOrder[b[1]] ?? 9))
    .map(([schema, rel]) => `
      <tr>
        <td class="schema-name">${escHtml(schema)}</td>
        <td><span class="relevance-pill relevance-pill--${escAttr(rel)}">${escHtml(relevanceLabels[rel] || rel)}</span></td>
      </tr>
    `).join('');
  const schemaRelevanceSection = relevanceRows ? `
    <section class="schema-relevance">
      <h2>Schema relevance (Phase 0.4)</h2>
      <p class="muted">What schema types this site's content suggests, and the relevance level the skill detected. Drives the <code>primaryEntitySchema</code> and <code>relevantSchemasApplied</code> evaluation.</p>
      <table class="relevance-table"><tbody>${relevanceRows}</tbody></table>
    </section>
  ` : '';

  // Issues by severity
  const renderAeoFinding = (issue, index) => {
    const sigLabel = signalLabel(issue.signal);
    const effortRationale = issue.effortRationale ? ` <span class="rationale">— ${escHtml(issue.effortRationale)}</span>` : '';
    const pagesList = (issue.pages && issue.pages.length)
      ? `<details class="pages"><summary>${issue.pages.length} page${issue.pages.length === 1 ? '' : 's'}</summary><ul>${issue.pages.map((p) => `<li>${renderLink(p)}</li>`).join('')}</ul></details>`
      : '';
    return `
      <article class="finding" id="aeo-finding-${index}">
        <header class="finding__header">
          <h4 class="finding__signal">${escHtml(sigLabel)}</h4>
          <span class="finding__criterion">${escHtml(criterionLabel(issue.criterion || ''))}</span>
        </header>
        <p class="finding__issue">${escHtml(issue.issue)}</p>
        <p class="finding__impact"><strong>Impact:</strong> ${escHtml(issue.impact)}</p>
        <p class="finding__effort"><span class="effort-tag">Effort: ${escHtml(issue.effort || 'unknown')}</span>${effortRationale}</p>
        ${pagesList}
      </article>
    `;
  };
  const renderAeoSeverityBlock = (sev) => {
    const findings = aeoReport.issues?.[sev] || [];
    const count = findings.length;
    const label = severityLabels[sev];
    if (count === 0) {
      return `
        <section class="severity-block severity-block--${sev} severity-block--empty">
          <header class="severity-block__header">
            <h3>${label}</h3><span class="severity-block__count">0</span>
          </header>
          <p class="severity-block__empty-message">No ${sev} findings.</p>
        </section>
      `;
    }
    const rendered = findings.map((f, i) => renderAeoFinding(f, `${sev}-${i}`)).join('');
    return `
      <details class="severity-block severity-block--${sev}" open>
        <summary class="severity-block__header">
          <h3>${label}</h3><span class="severity-block__count">${count}</span>
        </summary>
        <div class="severity-block__body">${rendered}</div>
      </details>
    `;
  };
  const findingsBlocks = severities.map(renderAeoSeverityBlock).join('');

  // Actionable prompts
  const prompts = aeoReport.actionablePrompts || [];
  const promptsSection = prompts.length === 0 ? `
    <section class="actionable-prompts">
      <h2>Actionable Claude prompts</h2>
      <p class="muted">All signals at status <code>pass</code> or <code>N/A</code> — no prompts to surface.</p>
    </section>
  ` : `
    <section class="actionable-prompts">
      <h2>Actionable Claude prompts</h2>
      <p class="muted">Each signal at status <code>fail</code> or <code>partial</code> has a ready-to-use prompt the site owner can paste into Claude to start fixing the gap.</p>
      ${prompts.map((p, i) => `
        <details class="prompt-block" ${i === 0 ? 'open' : ''}>
          <summary>${i + 1}. ${escHtml(signalLabel(p.signal))} <span class="muted">(${escHtml(criterionLabel(p.criterion))})</span></summary>
          <div class="prompt-block__body">
            <p><strong>Issue:</strong> ${escHtml(p.issue)}</p>
            <p><strong>Impact:</strong> ${escHtml(p.impact)}</p>
            <div class="prompt-block__prompt">${escHtml(p.prompt)}</div>
          </div>
        </details>
      `).join('')}
    </section>
  `;

  // Visited pages list
  const visitedPages = Array.isArray(aeoReport.visitedPages) ? aeoReport.visitedPages : [];
  const visitedPagesList = visitedPages.length
    ? `<ul>${visitedPages.map((p) => `<li>${renderLink(p)}</li>`).join('')}</ul>`
    : '<p class="muted">Not recorded.</p>';

  // Technical notes
  const tn = aeoReport.technicalNotes || {};
  const technicalNotesItems = [];
  if (typeof tn.httpsActive === 'boolean') technicalNotesItems.push(`<li>HTTPS active: ${tn.httpsActive ? 'yes' : 'no'}</li>`);
  if (typeof tn.mixedContentCount === 'number') technicalNotesItems.push(`<li>Mixed content count: ${tn.mixedContentCount}</li>`);
  if (typeof tn.javascriptRequired === 'boolean') technicalNotesItems.push(`<li>JavaScript required for core content: ${tn.javascriptRequired ? 'yes' : 'no'}</li>`);
  if (tn.robotsTxt) technicalNotesItems.push(`<li>robots.txt: ${escHtml(tn.robotsTxt)}</li>`);
  if (tn.sitemapUrl) technicalNotesItems.push(`<li>Sitemap: ${renderLink(tn.sitemapUrl)}</li>`);
  if (typeof tn.llmsTxtFound === 'boolean') technicalNotesItems.push(`<li>llms.txt found: ${tn.llmsTxtFound ? 'yes' : 'no'}</li>`);
  if (typeof tn.llmsFullTxtFound === 'boolean') technicalNotesItems.push(`<li>llms-full.txt found: ${tn.llmsFullTxtFound ? 'yes' : 'no'}</li>`);
  if (tn.cmsDetected) technicalNotesItems.push(`<li>CMS detected: ${escHtml(tn.cmsDetected)}</li>`);
  const technicalNotesHtml = technicalNotesItems.length
    ? `<ul>${technicalNotesItems.join('')}</ul>`
    : '<p class="muted">No technical notes recorded.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kosh AEO report — ${escHtml(websiteName)}</title>
<style>${styles}</style>
</head>
<body>
<div class="wrap">
  <header class="report-head">
    <h1>kosh AEO report — ${escHtml(websiteName)}</h1>
    <p class="site-url">${renderLink(aeoReport.url)}</p>
    <dl class="meta">
      <dt>Environment</dt><dd>${envTag}</dd>
      <dt>Site type</dt><dd>${siteTypeTag}</dd>
      <dt>Test date</dt><dd>${escHtml(reportDate)}</dd>
      <dt>Pages tested</dt><dd>${visitedPages.length ?? '—'}</dd>
      <dt>Rubric version</dt><dd>${escHtml(aeoReport.aeoRubricVersion || '—')}</dd>
    </dl>
  </header>

  <section class="summary">
    <h2>Signal evaluation</h2>
    <div class="status-grid">${statusCards}</div>
    <p class="muted">Across all ${summary.totalSignals ?? '—'} signals.</p>
    <h2 style="margin-top:1.5rem;">Findings summary</h2>
    <div class="severity-grid">${sevCards}</div>
  </section>

  <section class="findings-section">
    <h2>Detailed findings by criterion</h2>
    ${criteriaBlocks}
  </section>

  ${schemaRelevanceSection}

  <section class="findings-section">
    <h2>Issues by priority</h2>
    ${findingsBlocks}
  </section>

  ${promptsSection}

  <section class="methodology">
    <h2>Technical notes</h2>
    ${technicalNotesHtml}
    <div class="visited-pages">
      <h3>Visited pages</h3>
      ${visitedPagesList}
    </div>
    <p class="muted" style="margin-top:1rem;">Rubric: AEO ${escHtml(aeoReport.aeoRubricVersion || '?')} — 49 signals across 8 criteria, status-based evaluation (no scoring), site-type-aware.</p>
  </section>

  <footer class="report-foot">
    <p>Generated by kosh from <code>${escHtml(aeoInputFile)}</code>.</p>
    <p>Test type: AEO / AI Mode</p>
  </footer>
</div>
</body>
</html>
`;

  // Output file
  const parsedTimestamp = aeoReport.timestamp ? new Date(aeoReport.timestamp) : null;
  const aeoTimestamp = (parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime()))
    ? parsedTimestamp.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  let safeName = String(websiteName).toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_.-]/g, '');
  if (!safeName) {
    // Non-ASCII websiteName (e.g. CJK characters) — derive a slug from the URL hostname so the file is identifiable.
    try {
      const host = new URL(aeoReport.url || '').hostname.replace(/^www\./, '');
      safeName = host.toUpperCase().replace(/[^A-Z0-9_.-]/g, '_') || 'SITE';
    } catch {
      safeName = 'SITE';
    }
  }
  const filenameTag = cliTestTypeLabel || 'AEO';
  const aeoOutputFilename = `${safeName}_${filenameTag}_QA_REPORT_${aeoTimestamp}.html`;
  const aeoReportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(aeoReportsDir)) fs.mkdirSync(aeoReportsDir, { recursive: true });

  const aeoOutputPath = path.join(aeoReportsDir, aeoOutputFilename);
  fs.writeFileSync(aeoOutputPath, html);
  console.log(`HTML report generated: ${aeoOutputPath}`);
}
