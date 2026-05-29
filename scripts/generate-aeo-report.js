#!/usr/bin/env node
// Generate a Markdown AEO QA report from reports/data/qa-report-aeo.json.
// Usage: node generate-aeo-report.js [path-to-json]

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || path.join(__dirname, '../reports/data/qa-report-aeo.json');

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found at ${inputFile}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const esc = (val) => String(val ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\r?\n/g, ' ')
  .replace(/\|/g, '&#124;');

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

// Human-readable labels for the 8 criteria, in display order
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

// Human-readable labels for canonical signal keys (49 signals)
const SIGNAL_LABELS = {
  // technicalHealth (6)
  robotsAndCrawlerAccess: 'robots.txt and AI crawler access',
  noNoindex: 'No noindex on homepage',
  httpsNoMixedContent: 'HTTPS, no mixed content',
  sitemapLastmod: 'Sitemap with valid lastmod dates',
  nojsAccessible: 'Core content accessible without JavaScript',
  canonicalUrls: 'Canonical URLs on homepage and inner pages',
  // structuredData (7)
  organizationSchema: 'Organization schema',
  primaryEntitySchema: 'Primary entity schema (content-driven)',
  relevantSchemasApplied: 'Relevant schemas applied (coverage of detected content types)',
  faqSchema: 'FAQ schema',
  jsonLdFormat: 'Structured-data format used (JSON-LD / microdata / RDFa)',
  openGraphTags: 'Open Graph tags complete',
  reviewSchema: 'Review or AggregateRating schema',
  // aeoReadiness (8)
  directAnswers: 'Direct answers after headings',
  whoWhatWho: 'Who / what / who content',
  featuredSnippetStructure: 'Featured snippet structure',
  answerCapsules: 'Answer capsules (40–60 words under H2/H3)',
  faqSectionPresent: 'FAQ section present',
  faqSchemaApplied: 'FAQ schema applied',
  questionFramedHeadings: 'Question-framed headings',
  titleAndMetaQuestionMatch: 'Title and meta description question-match',
  // eeatSignals (8)
  namedTeamMembers: 'Named individuals with roles',
  authorCredentials: 'Author / staff credentials',
  authorBylines: 'Author bylines with Person schema',
  demonstratedExpertise: 'Demonstrated expertise',
  externalCitations: 'External citations or press',
  certificationBadges: 'Credentialing badges',
  namedExternalRelationships: 'Named external relationships',
  tenureIndicators: 'Tenure indicators (founded / since)',
  // contentFreshness (7)
  copyrightYearCurrent: 'Copyright year current',
  blogNewsRecent: 'Blog / news / featured content (last 6 months)',
  dateStampsOnContent: 'Date stamps on posts or featured items',
  contentUpdateRecency: 'Per-page "Last updated" stamps (last 12 months)',
  sitemapLastmodRecent: 'Sitemap lastmod dates recent',
  recentFeaturedWork: 'Recent featured work',
  currentDomainReferences: 'Current domain references',
  // entityClarity (5)
  entityIdentifiable: 'Named entity identifiable in one sentence',
  primaryFocusSpecificity: 'Primary focus specificity',
  socialProfileLinks: 'Social profile links in footer',
  geographicMarketClarity: 'Geographic or market clarity',
  consistentIdentity: 'Consistent identity signals',
  // contentSpecificity (5)
  primaryOfferingDetail: 'Primary offering detail (what, who, outcome)',
  namedSpecificEntities: 'Named specific entities',
  namedSubjectAreas: 'Named subject areas',
  specificOutcomes: 'Specific outcomes or quantified results',
  passageExtractionQuality: 'Passage extraction quality',
  // llmsTxt (3)
  llmsTxtPresent: 'llms.txt present',
  llmsFullTxtPresent: 'llms-full.txt present',
  llmsTxtContent: 'llms.txt content accurate and specific',
};

// Human-readable labels for siteType enum
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

const signalLabel = (key) => SIGNAL_LABELS[key] || key;

const thresholdLabel = (t) => {
  if (t === 'strong') return 'Strong';
  if (t === 'needs-work') return 'Needs work';
  if (t === 'at-risk') return 'At risk';
  return t;
};

const thresholdEmoji = (t) => {
  if (t === 'strong') return '🟢';
  if (t === 'needs-work') return '🟡';
  if (t === 'at-risk') return '🔴';
  return '';
};

// ---------- Build Markdown ----------

const siteTypeLabel = SITE_TYPE_LABELS[report.siteType] || report.siteType || 'Other / Unknown';

let md = `# Kosh AEO Report - ${websiteName}

**URL:** ${esc(report.url)}
**Test Date:** ${new Date(report.timestamp).toLocaleString()}
**Tester:** Kosh
**Test Type:** AEO / AI Mode
**Site Type:** ${esc(siteTypeLabel)}${report.siteTypeConfidence ? ` (confidence: ${esc(report.siteTypeConfidence)})` : ''}${report.siteTypeRationale ? ` — *${esc(report.siteTypeRationale)}*` : ''}
**Environment:** ${esc(report.environment || 'production')}
**Rubric Version:** ${esc(report.aeoRubricVersion)}

---

## Executive Summary

This report evaluates ${websiteName} for AEO (Answer Engine Optimization) — how AI tools like ChatGPT, Perplexity, Claude, and Google AI Overviews discover, parse, understand, and cite the site.

### Overall Score

${thresholdEmoji(report.threshold)} **${report.score} / 100 — ${thresholdLabel(report.threshold)}**

| Score | Status |
|---|---|
| 80 – 100 | Strong |
| 50 – 79 | Needs work |
| 0 – 49 | At risk |

### Pages Tested

${(report.visitedPages || []).map(p => `- ${esc(p)}`).join('\n') || '- (none recorded)'}

### Issues Summary

- **Critical:** ${report.issues.critical.length}
- **High:** ${report.issues.high.length}
- **Medium:** ${report.issues.medium.length}
- **Low:** ${report.issues.low.length}

---

## Score by Criterion

| Criterion | Score | Max | Fill |
|---|---|---|---|
`;

for (const [key, label] of CRITERION_ORDER) {
  const c = report.criteria?.[key];
  if (!c) {
    md += `| ${label} | — | — | — |\n`;
    continue;
  }
  const fillPct = c.maxScore > 0 ? Math.round((c.score / c.maxScore) * 100) : 0;
  md += `| ${label} | ${c.score} | ${c.maxScore} | ${fillPct}% |\n`;
}

md += `
---

## Detailed Findings

`;

// Per-criterion signal breakdown
for (const [key, label] of CRITERION_ORDER) {
  const c = report.criteria?.[key];
  if (!c) continue;

  md += `### ${label} — ${c.score} / ${c.maxScore}\n\n`;

  const signals = c.signals || {};
  const signalKeys = Object.keys(signals);
  if (signalKeys.length === 0) {
    md += `*(No signal data recorded for this criterion.)*\n\n`;
    continue;
  }

  md += `| Signal | Score | Max | Notes |\n`;
  md += `|---|---|---|---|\n`;

  for (const sigKey of signalKeys) {
    const sig = signals[sigKey];
    const status = sig.score >= sig.maxScore ? '✅' : (sig.score === 0 ? '❌' : '⚠️');
    md += `| ${status} ${esc(signalLabel(sigKey))} | ${sig.score} | ${sig.maxScore} | ${esc(sig.notes || '—')} |\n`;
  }
  md += `\n`;
}

md += `---

## Technical Notes

`;

const tn = report.technicalNotes || {};
md += `- **HTTPS active:** ${tn.httpsActive ? '✅ Yes' : '❌ No'}\n`;
if (typeof tn.mixedContentCount === 'number') {
  md += `- **Mixed content count:** ${tn.mixedContentCount}\n`;
}
md += `- **JavaScript required for core content:** ${tn.javascriptRequired ? '⚠️ Yes' : '✅ No'}\n`;
if (tn.robotsTxt) md += `- **robots.txt:** ${esc(tn.robotsTxt)}\n`;
if (tn.sitemapUrl) md += `- **Sitemap URL:** ${esc(tn.sitemapUrl)}\n`;
md += `- **llms.txt found:** ${tn.llmsTxtFound ? '✅ Yes' : '❌ No'}\n`;
md += `- **llms-full.txt found:** ${tn.llmsFullTxtFound ? '✅ Yes' : '❌ No'}\n`;
if (tn.cmsDetected) md += `- **CMS detected:** ${esc(tn.cmsDetected)}\n`;

if (tn.applicableSchemas && Object.keys(tn.applicableSchemas).length > 0) {
  md += `\n### Schema Relevance (Phase 0.4)\n\n`;
  md += `What schema types this site's content suggests, and the relevance level the skill detected. Drives the \`primaryEntitySchema\` and \`relevantSchemasApplied\` scoring.\n\n`;
  md += `| Schema | Relevance |\n|---|---|\n`;
  const relevanceOrder = { high: 0, medium: 1, low: 2, absent: 3 };
  const relevanceEmoji = { high: '🟢 High', medium: '🟡 Medium', low: '⚪ Low', absent: '— Absent' };
  Object.entries(tn.applicableSchemas)
    .sort((a, b) => (relevanceOrder[a[1]] ?? 9) - (relevanceOrder[b[1]] ?? 9))
    .forEach(([schema, rel]) => {
      md += `| ${esc(schema)} | ${relevanceEmoji[rel] || esc(rel)} |\n`;
    });
  md += `\n`;
}

md += `
---

## Issues by Priority

`;

const renderIssueSection = (title, issues, emptyText) => {
  let out = `### ${title} (${issues.length})\n\n`;
  if (issues.length === 0) {
    out += `${emptyText}\n\n`;
    return out;
  }
  issues.forEach((issue, i) => {
    const sigLabel = signalLabel(issue.signal);
    out += `${i + 1}. **${esc(sigLabel)}** *(criterion: ${esc(issue.criterion)})*\n`;
    out += `   - **Issue:** ${esc(issue.issue)}\n`;
    out += `   - **Impact:** ${esc(issue.impact)}\n`;
    out += `   - **Effort:** ${esc(issue.effort)}`;
    if (issue.effortRationale) out += ` — *${esc(issue.effortRationale)}*`;
    out += `\n`;
    if (issue.pages && issue.pages.length) {
      out += `   - **Pages:** ${issue.pages.map(p => esc(p)).join(', ')}\n`;
    }
    out += `\n`;
  });
  return out;
};

md += renderIssueSection('Critical Issues', report.issues.critical, '✅ No critical issues found.');
md += renderIssueSection('High Priority Issues', report.issues.high, '✅ No high priority issues found.');
md += renderIssueSection('Medium Priority Issues', report.issues.medium, '✅ No medium priority issues found.');
md += renderIssueSection('Low Priority Issues', report.issues.low, '✅ No low priority issues found.');

md += `---

## Actionable Claude Prompts

Each below-max signal has a ready-to-use prompt the site owner can paste into Claude to start fixing the gap.

`;

const prompts = report.actionablePrompts || [];
if (prompts.length === 0) {
  md += `*(All signals scored at maximum — no actionable prompts to surface.)*\n\n`;
} else {
  prompts.forEach((p, i) => {
    md += `### ${i + 1}. ${esc(signalLabel(p.signal))}\n\n`;
    md += `*Criterion: ${esc(p.criterion)}*\n\n`;
    md += `**Issue:** ${esc(p.issue)}\n\n`;
    md += `**Impact:** ${esc(p.impact)}\n\n`;
    md += `**Prompt:**\n\n`;
    // Render prompt inside a code fence for clean copying
    md += '```\n';
    md += p.prompt;
    md += '\n```\n\n';
  });
}

md += `---

## Recommendations

### Immediate Actions (Critical + High)

`;

const immediateIssues = [...report.issues.critical, ...report.issues.high];
if (immediateIssues.length === 0) {
  md += `✅ No immediate actions required.\n\n`;
} else {
  immediateIssues.slice(0, 10).forEach((issue, i) => {
    md += `${i + 1}. **${esc(signalLabel(issue.signal))}** *(effort: ${esc(issue.effort)})* — ${esc(issue.issue)}\n`;
  });
  if (immediateIssues.length > 10) {
    md += `\n*…and ${immediateIssues.length - 10} more critical/high issues.*\n`;
  }
  md += `\n`;
}

md += `### Quick Wins (Low Effort)

`;

const allIssues = [
  ...report.issues.critical,
  ...report.issues.high,
  ...report.issues.medium,
  ...report.issues.low,
];
const lowEffortIssues = allIssues.filter(i => i.effort === 'low');
if (lowEffortIssues.length === 0) {
  md += `*(No low-effort issues identified.)*\n\n`;
} else {
  lowEffortIssues.slice(0, 10).forEach((issue, i) => {
    md += `${i + 1}. **${esc(signalLabel(issue.signal))}** — ${esc(issue.issue)}\n`;
  });
  md += `\n`;
}

md += `---

## Testing Notes

### Test Environment

- **Tool:** Playwright MCP
- **Browser:** Chromium (headless)
- **Test Date:** ${new Date(report.timestamp).toLocaleString()}
- **Viewport:** Desktop (1920×1080)
- **Pages tested:** ${(report.visitedPages || []).length}
- **Rubric:** AEO ${esc(report.aeoRubricVersion)} — 49 signals across 8 criteria, 100 pts total (site-type-aware)

### Raw Data

- Full JSON report: \`${inputFile}\`

---

## Summary

${websiteName} scored **${report.score}/100** for AEO readiness (${thresholdLabel(report.threshold)}). The site was evaluated against an 8-criterion rubric covering technical health, structured data, AEO readiness, E-E-A-T signals, content freshness, entity clarity, content specificity, and llms.txt.

**Areas for Improvement:**

- ${report.issues.critical.length} critical issues blocking AI discoverability
- ${report.issues.high.length} high priority issues weakening AI understanding
- ${report.issues.medium.length} medium priority improvements
- ${report.issues.low.length} low priority polish

**Overall Assessment:**

${report.threshold === 'strong'
  ? '✅ The site is well-positioned for AI discovery and citation. Address the remaining issues to consolidate the strong score.'
  : report.threshold === 'needs-work'
    ? '⚠️ The site has notable gaps that limit how reliably AI tools can find, parse, and cite it. Prioritise the critical and high issues.'
    : '❌ The site has significant AEO gaps. Address the critical issues first — without basic schema and crawler access, AI tools cannot reliably cite the site.'}

---

*Report generated by Kosh, an automated testing tool.*
*Test Type: AEO / AI Mode (rubric ${esc(report.aeoRubricVersion)})*
`;

// ---------- Write output ----------

const parsedTimestamp = new Date(report.timestamp);
const timestamp = Number.isNaN(parsedTimestamp.getTime())
  ? new Date().toISOString().split('T')[0]
  : parsedTimestamp.toISOString().split('T')[0];
const slug = websiteName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_-]/g, '');
const outputFilename = `${slug}_AEO_QA_REPORT_${timestamp}.md`;
const reportsDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

const outputPath = path.join(reportsDir, outputFilename);
fs.writeFileSync(outputPath, md);
console.log(`Markdown report generated: ${outputPath}`);
