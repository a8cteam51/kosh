const fs = require('fs');
const path = require('path');

// Parse command line arguments
// Usage: node generate-report.js <json-file> [--functional] [--performance] [--accessibility] [--aeo]
// Default (no flags): includes all available data for the detected report type
const inputFile = process.argv[2] || path.join(__dirname, '../reports/data/qa-report.json');
const args = process.argv.slice(3);

// Validate that the input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found at ${inputFile}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const esc = (val) => String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ').replace(/\|/g, '&#124;');

// Route AEO reports to the AEO-specific renderer (different report shape, no scoring).
// Detected automatically when report.mode === 'aeo', or forced via --aeo.
const isAeoReport = report.mode === 'aeo' || args.includes('--aeo');
if (isAeoReport) {
  renderAeoReport(report, inputFile);
  process.exit(0);
}

// Determine which sections to include (functional / performance / a11y reports below)
const includeAll = args.length === 0;
const includeFunctional = includeAll || args.includes('--functional');
const includePerformance = includeAll || args.includes('--performance');
const includeAccessibility = includeAll || args.includes('--accessibility');

// Determine test type based on what data is available
const hasPerformanceData = report.mobile?.console || report.desktop?.console || report.mobile?.network || report.desktop?.network;
const hasAccessibilityData = report.mobile?.a11y || report.desktop?.a11y;

// Extract website name from URL
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

// Build Issues Summary text
let issuesSummary = '';

if (report.issues.critical.length > 0) {
  issuesSummary += `**Critical Issues (${report.issues.critical.length}):**\n`;
  issuesSummary += report.issues.critical.map(issue => `- ${esc(issue.category)}: ${esc(issue.issue)}`).join('\n');
  issuesSummary += '\n\n';
}

if (report.issues.high.length > 0) {
  issuesSummary += `**High Priority Issues (${report.issues.high.length}):**\n`;
  const displayedHigh = report.issues.high.slice(0, 10);
  issuesSummary += displayedHigh.map(issue => `- ${esc(issue.category)}: ${esc(issue.issue)}`).join('\n');
  if (report.issues.high.length > 10) {
    issuesSummary += `\n- ... and ${report.issues.high.length - 10} more`;
  }
  issuesSummary += '\n\n';
}

if (report.issues.medium.length > 0) {
  issuesSummary += `**Medium Priority Issues (${report.issues.medium.length}):**\n`;
  const displayedMedium = report.issues.medium.slice(0, 10);
  issuesSummary += displayedMedium.map(issue => `- ${esc(issue.category)}: ${esc(issue.issue)}`).join('\n');
  if (report.issues.medium.length > 10) {
    issuesSummary += `\n- ... and ${report.issues.medium.length - 10} more`;
  }
  issuesSummary += '\n\n';
}

if (report.issues.low.length > 0) {
  issuesSummary += `**Low Priority Issues (${report.issues.low.length}):**\n`;
  const displayedLow = report.issues.low.slice(0, 10);
  issuesSummary += displayedLow.map(issue => `- ${esc(issue.category)}: ${esc(issue.issue)}`).join('\n');
  if (report.issues.low.length > 10) {
    issuesSummary += `\n- ... and ${report.issues.low.length - 10} more`;
  }
}

let markdown = `# Kosh Report - ${websiteName}

**URL:** ${esc(report.url)}
**Test Date:** ${new Date(report.timestamp).toLocaleString()}
**Tester:** Kosh
**Test Type:** ${includeFunctional ? 'Functional & Design' : ''}${includePerformance ? (includeFunctional ? ', Performance' : 'Performance') : ''}${includeAccessibility ? (includeFunctional || includePerformance ? ', Accessibility' : 'Accessibility') : ''}

---

## Executive Summary

This report covers ${includeFunctional ? 'functional and design ' : ''}${includePerformance ? 'performance ' : ''}${includeAccessibility ? 'accessibility ' : ''}testing of the ${websiteName} website across mobile (375px) and desktop (1920px) viewports.

### Key Findings

- **Page Title:** ${esc(report.desktop.title) || 'N/A'}
${includeFunctional ? `- **Total Links Found:** ${report.desktop.links?.length || 0}
- **Total Images Found:** ${report.desktop.images?.length || 0}` : ''}
- **Critical Issues:** ${report.issues.critical.length}
- **High Priority Issues:** ${report.issues.high.length}
- **Medium Priority Issues:** ${report.issues.medium.length}
- **Low Priority Issues:** ${report.issues.low.length}

#### Issues Summary

${issuesSummary}

---

## Test Coverage Summary

### Viewports Tested
- ✅ Mobile: ${report.mobile.viewport} (iPhone SE)
- ✅ Desktop: ${report.desktop.viewport}

### Testing Categories Completed
${includeFunctional ? `- ✅ Design & Visual Testing (spacing, layout, typography, images)
- ✅ Link Validation (${report.links?.length || 0} links validated)
- ✅ OpenGraph & Social Sharing Metadata
- ✅ Content Quality Review
` : ''}${includePerformance ? `- ✅ Performance Metrics
- ✅ Console & Network Error Detection
` : ''}${includeAccessibility ? `- ✅ Accessibility Testing (WCAG 2.2 Level AA)
- ✅ Keyboard Navigation Testing
` : ''}
---

## Detailed Findings

`;

// Detailed Findings sections — counter increments for each included section
let sec = 0;

// Performance Metrics
if (includePerformance) {
  markdown += `### ${++sec}. Performance Metrics

| Metric | Mobile | Desktop |
|--------|--------|---------|
| Page Load Time | ${report.mobile.loadTime}ms | ${report.desktop.loadTime}ms |
| Title | ${esc(report.mobile.title)} | ${esc(report.desktop.title)} |
| Final URL | ${esc(report.mobile.url)} | ${esc(report.desktop.url)} |

**Analysis:**
`;

  if (report.mobile.loadTime > 3000) {
    markdown += `- ⚠️ Mobile load time exceeds 3 seconds (${report.mobile.loadTime}ms)\n`;
  } else {
    markdown += `- ✅ Mobile load time is acceptable (${report.mobile.loadTime}ms)\n`;
  }

  if (report.desktop.loadTime > 2000) {
    markdown += `- ⚠️ Desktop load time could be improved (${report.desktop.loadTime}ms)\n`;
  } else {
    markdown += `- ✅ Desktop load time is good (${report.desktop.loadTime}ms)\n`;
  }
}

// OpenGraph & Social Sharing Metadata
if (includeFunctional) {
  markdown += `
### ${++sec}. OpenGraph & Social Sharing Metadata

| Meta Tag | Value | Status |
|----------|-------|--------|
| og:title | ${esc(report.metadata.ogTitle) || 'Missing'} | ${report.metadata.ogTitle ? '✅' : '❌'} |
| og:description | ${esc(report.metadata.ogDescription) || 'Missing'} | ${report.metadata.ogDescription ? '✅' : '❌'} |
| og:image | ${esc(report.metadata.ogImage) || 'Missing'} | ${report.metadata.ogImage ? '✅' : '❌'} |
| og:url | ${esc(report.metadata.ogUrl) || 'Missing'} | ${report.metadata.ogUrl ? '✅' : '❌'} |
| og:type | ${esc(report.metadata.ogType) || 'Missing'} | ${report.metadata.ogType ? '✅' : '❌'} |
| twitter:card | ${esc(report.metadata.twitterCard) || 'Missing'} | ${report.metadata.twitterCard ? '✅' : '❌'} |
| twitter:title | ${esc(report.metadata.twitterTitle) || 'Missing'} | ${report.metadata.twitterTitle ? '✅' : '❌'} |
| twitter:description | ${esc(report.metadata.twitterDescription) || 'Missing'} | ${report.metadata.twitterDescription ? '✅' : '❌'} |
| twitter:image | ${esc(report.metadata.twitterImage) || 'Missing'} | ${report.metadata.twitterImage ? '✅' : '❌'} |

**Analysis:**
`;

  const metaIssues = [];
  if (!report.metadata.ogTitle) metaIssues.push('og:title is missing - social shares will not display proper title');
  if (!report.metadata.ogDescription) metaIssues.push('og:description is missing - social shares will not display proper description');
  if (!report.metadata.ogImage) metaIssues.push('og:image is missing - social shares will not display preview image');
  if (!report.metadata.ogUrl) metaIssues.push('og:url is missing - may cause tracking issues');

  if (metaIssues.length === 0) {
    markdown += '- ✅ All essential OpenGraph tags are present\n';
  } else {
    metaIssues.forEach(issue => {
      markdown += `- ❌ ${issue}\n`;
    });
  }
}

// Link Validation
if (includeFunctional) {
  markdown += `
### ${++sec}. Link Validation

**Total Links Found:** ${report.desktop.links?.length || 0}
**Links Validated:** ${report.links?.length || 0}

**Link Status Summary:**
`;

  const linkStatuses = {};
  (report.links || []).forEach(link => {
    const status = link.status === 'skipped' ? 'Skipped (anchor/javascript)' :
                   link.status === 'error' ? 'Error' :
                   link.ok ? 'OK (200-299)' : `HTTP ${link.status}`;
    linkStatuses[status] = (linkStatuses[status] || 0) + 1;
  });

  Object.entries(linkStatuses).forEach(([status, count]) => {
    markdown += `- ${status}: ${count} links\n`;
  });

  const brokenLinks = (report.links || []).filter(l => !l.ok && l.status !== 'skipped');
  if (brokenLinks.length > 0) {
    markdown += '\n**Broken Links Detected:**\n\n';
    brokenLinks.slice(0, 10).forEach(link => {
      markdown += `- ❌ [${esc(link.text) || 'No text'}](${link.href}) - Status: ${link.status}\n`;
    });
  }

  markdown += `
**Social Media Icon Links:**
`;

  const socialLinks = report.desktop.links?.filter(l => l.hasIcon && l.isExternal) || [];
  if (socialLinks.length > 0) {
    socialLinks.slice(0, 10).forEach(link => {
      markdown += `- Icon: "${esc(link.iconType)}" → ${esc(link.href)}\n`;
    });
  } else {
    markdown += '- No icon-based social media links detected\n';
  }
}

// Images & Media
if (includeFunctional) {
  markdown += `
### ${++sec}. Images & Media

**Total Images:** ${report.desktop.images?.length || 0}

**Image Analysis:**
`;

  // Support both schemas: `complete` field (boolean) and `naturalWidth` field (0 = broken)
  const allIncompleteImages = report.desktop.images?.filter(img =>
    img.complete === false || (img.naturalWidth === 0 && img.complete !== undefined)
  ) || [];
  const lazyLoadedImages = allIncompleteImages.filter(img => img.isLazyLoaded === true) || [];
  const brokenImages = allIncompleteImages.filter(img => img.isLazyLoaded !== true) || [];
  // Support both schemas: `hasAlt` (boolean) and `alt` (string — empty string = missing)
  const missingAlt = report.desktop.images?.filter(img => {
    if (img.src.startsWith('data:')) return false;
    if (typeof img.hasAlt === 'boolean') return !img.hasAlt;
    return !img.alt && img.alt !== undefined;
  }) || [];

  markdown += `- Broken images: ${brokenImages.length}\n`;
  markdown += `- Lazy-loaded images (not yet in viewport): ${lazyLoadedImages.length}\n`;
  markdown += `- Images missing alt text: ${missingAlt.length}\n`;

  if (brokenImages.length > 0) {
    markdown += '\n**Broken Images:**\n';
    brokenImages.slice(0, 5).forEach(img => {
      markdown += `- ❌ ${esc(img.src)}\n`;
    });
  }

  if (lazyLoadedImages.length > 0) {
    markdown += '\n**Lazy-Loaded Images (Expected - Not Yet in Viewport):**\n';
    markdown += '📝 Note: These images use `loading="lazy"` and will load when scrolled into view. This is normal optimization and not a bug.\n';
    lazyLoadedImages.slice(0, 5).forEach(img => {
      markdown += `- 📄 ${esc(img.src.substring(0, 80))}...\n`;
    });
  }

  if (missingAlt.length > 0) {
    markdown += `\n**Images Missing Alt Text (Accessibility Issue):**\n`;
    missingAlt.slice(0, 10).forEach(img => {
      markdown += `- ⚠️ ${esc(img.src)}\n`;
    });
  }

  const lowResImages = report.desktop.images?.filter(img =>
    img.displayWidth > 0 && img.width > 0 && img.displayWidth > img.width * 1.5
  ) || [];

  if (lowResImages.length > 0) {
    markdown += `\n**Potentially Low-Resolution Images:**\n`;
    lowResImages.slice(0, 5).forEach(img => {
      markdown += `- ⚠️ ${esc(img.src.substring(0, 60))}... (Natural: ${img.width}x${img.height}, Displayed: ${img.displayWidth}x${img.displayHeight})\n`;
    });
  }
}

// Typography & Heading Hierarchy
if (includeFunctional) {
  markdown += `
### ${++sec}. Typography & Heading Hierarchy

**Total Headings:** ${report.desktop.headings?.length || 0}

**Heading Structure:**
`;

  const headingCounts = {};
  report.desktop.headings?.forEach(h => {
    headingCounts[h.tag] = (headingCounts[h.tag] || 0) + 1;
  });

  Object.entries(headingCounts).sort().forEach(([tag, count]) => {
    markdown += `- ${tag.toUpperCase()}: ${count}\n`;
  });

  const orphanedHeadings = report.desktop.headings?.filter(h => h.hasOrphan) || [];
  if (orphanedHeadings.length > 0) {
    markdown += `\n**Orphaned Words Detected (Typography Issue):**\n`;
    orphanedHeadings.slice(0, 10).forEach(h => {
      markdown += `- ⚠️ ${h.tag.toUpperCase()}: "${esc(h.text)}" (last word: "${esc(h.lastWord)}")\n`;
    });
  }
}

// Accessibility
if (includeAccessibility) {
  markdown += `
### ${++sec}. Accessibility (WCAG 2.2 Level AA)

**Accessibility Issues Found:**
- Mobile: ${report.mobile.a11y?.length || 0} issues
- Desktop: ${report.desktop.a11y?.length || 0} issues

**Issue Breakdown:**
`;

  const a11yIssueTypes = {};
  [...report.mobile.a11y || [], ...report.desktop.a11y || []].forEach(issue => {
    a11yIssueTypes[issue.type] = (a11yIssueTypes[issue.type] || 0) + 1;
  });

  Object.entries(a11yIssueTypes).forEach(([type, count]) => {
    let description = type;
    if (type === 'missing-label') description = 'Form inputs missing labels';
    if (type === 'button-no-text') description = 'Buttons without accessible text';
    if (type === 'heading-skip') description = 'Skipped heading levels';
    markdown += `- ${description}: ${count}\n`;
  });

  if (report.desktop.a11y && report.desktop.a11y.length > 0) {
    markdown += '\n**Detailed Accessibility Issues:**\n';
    report.desktop.a11y.slice(0, 10).forEach(issue => {
      markdown += `- ⚠️ ${esc(issue.type)}`;
      if (issue.from && issue.to) markdown += ` (${esc(issue.from)} → ${esc(issue.to)})`;
      if (issue.element) markdown += ` - ${esc(issue.element)}`;
      markdown += '\n';
    });
  }

  markdown += `
**Keyboard Navigation:**
- Mobile: ${report.mobile.focusableElements || 0} focusable elements
- Desktop: ${report.desktop.focusableElements || 0} focusable elements

`;
}

// Console & Network Errors
if (includePerformance) {
  markdown += `### ${++sec}. Console & Network Errors

**Console Messages:**
`;

  const mobileErrors = report.mobile.console?.filter(c => c.type === 'error') || [];
  const desktopErrors = report.desktop.console?.filter(c => c.type === 'error') || [];

  markdown += `- Mobile errors: ${mobileErrors.length}\n`;
  markdown += `- Desktop errors: ${desktopErrors.length}\n`;

  if (desktopErrors.length > 0) {
    markdown += '\n**Console Errors (Desktop):**\n';
    desktopErrors.slice(0, 5).forEach(err => {
      markdown += `- ❌ ${esc(err.text)}\n`;
    });
  }

  markdown += `
**Network Errors:**
- Mobile: ${report.mobile.network?.length || 0} failed requests
- Desktop: ${report.desktop.network?.length || 0} failed requests
`;

  if (report.desktop.network && report.desktop.network.length > 0) {
    markdown += '\n**Failed Network Requests:**\n';
    report.desktop.network.slice(0, 10).forEach(err => {
      markdown += `- ❌ HTTP ${err.status}: ${esc(err.url)}\n`;
    });
  }
}

markdown += `
---

## Issues Found by Priority

### Critical Issues (${report.issues.critical.length})

`;

if (report.issues.critical.length === 0) {
  markdown += '✅ No critical issues found!\n\n';
} else {
  report.issues.critical.forEach((issue, i) => {
    markdown += `${i + 1}. **${esc(issue.category)}**: ${esc(issue.issue)}\n`;
    markdown += `   - Impact: ${esc(issue.impact)}\n`;
    if (issue.device) markdown += `   - Device: ${esc(issue.device)}\n`;
    markdown += '\n';
  });
}

markdown += `### High Priority Issues (${report.issues.high.length})

`;

if (report.issues.high.length === 0) {
  markdown += '✅ No high priority issues found!\n\n';
} else {
  report.issues.high.slice(0, 15).forEach((issue, i) => {
    markdown += `${i + 1}. **${esc(issue.category)}**: ${esc(issue.issue)}\n`;
    markdown += `   - Impact: ${esc(issue.impact)}\n`;
    if (issue.device) markdown += `   - Device: ${esc(issue.device)}\n`;
    markdown += '\n';
  });
  if (report.issues.high.length > 15) {
    markdown += `*... and ${report.issues.high.length - 15} more high priority issues*\n\n`;
  }
}

markdown += `### Medium Priority Issues (${report.issues.medium.length})

`;

if (report.issues.medium.length === 0) {
  markdown += '✅ No medium priority issues found!\n\n';
} else {
  report.issues.medium.slice(0, 15).forEach((issue, i) => {
    markdown += `${i + 1}. **${esc(issue.category)}**: ${esc(issue.issue)}\n`;
    markdown += `   - Impact: ${esc(issue.impact)}\n`;
    if (issue.device) markdown += `   - Device: ${esc(issue.device)}\n`;
    markdown += '\n';
  });
  if (report.issues.medium.length > 15) {
    markdown += `*... and ${report.issues.medium.length - 15} more medium priority issues*\n\n`;
  }
}

markdown += `### Low Priority Issues (${report.issues.low.length})

`;

if (report.issues.low.length === 0) {
  markdown += '✅ No low priority issues found!\n\n';
} else {
  report.issues.low.forEach((issue, i) => {
    markdown += `${i + 1}. **${esc(issue.category)}**: ${esc(issue.issue)}\n`;
    markdown += `   - Impact: ${esc(issue.impact)}\n`;
    markdown += '\n';
  });
}

// Compute values for recommendations
const missingAltRec = report.desktop.images?.filter(img => {
  if (img.src.startsWith('data:')) return false;
  if (typeof img.hasAlt === 'boolean') return !img.hasAlt;
  return !img.alt && img.alt !== undefined;
}) || [];
const orphanedHeadings = report.desktop.headings?.filter(h => h.hasOrphan) || [];
const lowResImages = report.desktop.images?.filter(img =>
  img.displayWidth > 0 && img.width > 0 && img.displayWidth > img.width * 1.5
) || [];
const brokenImagesRec = report.desktop.images?.filter(img =>
  (img.complete === false || (img.naturalWidth === 0 && img.complete !== undefined)) && img.isLazyLoaded !== true
) || [];
const missingOgTags = includeFunctional ? [
  !report.metadata.ogTitle && 'og:title',
  !report.metadata.ogDescription && 'og:description',
  !report.metadata.ogImage && 'og:image',
  !report.metadata.ogUrl && 'og:url',
].filter(Boolean) : [];
const a11yIssues = [...report.mobile?.a11y || [], ...report.desktop?.a11y || []];
const formLabelIssues = a11yIssues.filter(i => i.type === 'missing-label').length;
const buttonTextIssues = a11yIssues.filter(i => i.type === 'button-no-text').length;
const headingSkipIssues = a11yIssues.filter(i => i.type === 'heading-skip').length;
const consoleErrors = includePerformance
  ? (report.mobile.console?.filter(c => c.type === 'error').length || 0) +
    (report.desktop.console?.filter(c => c.type === 'error').length || 0)
  : 0;
const networkErrors = includePerformance
  ? (report.mobile.network?.length || 0) + (report.desktop.network?.length || 0)
  : 0;
const loadTimeIssues = includePerformance &&
  (report.mobile.loadTime > 3000 || report.desktop.loadTime > 2000);

// Build recommendations lists
const immediateActions = [];

if (missingOgTags.length > 0) {
  immediateActions.push(`**Fix Metadata Issues** — missing tags: ${missingOgTags.join(', ')}. Ensure og:image is 1200x630px with an absolute URL.`);
}
if (missingAltRec.length > 0) {
  immediateActions.push(`**Add Missing Alt Text** — ${missingAltRec.length} image${missingAltRec.length > 1 ? 's are' : ' is'} missing alt text, blocking screen readers.`);
}
if (formLabelIssues > 0) {
  immediateActions.push(`**Fix Form Input Labels** — ${formLabelIssues} input${formLabelIssues > 1 ? 's are' : ' is'} missing associated labels.`);
}
if (buttonTextIssues > 0) {
  immediateActions.push(`**Add Button Accessible Text** — ${buttonTextIssues} button${buttonTextIssues > 1 ? 's have' : ' has'} no accessible text; add aria-label attributes.`);
}
if (consoleErrors > 0 || networkErrors > 0) {
  const errParts = [];
  if (consoleErrors > 0) errParts.push(`${consoleErrors} console error${consoleErrors > 1 ? 's' : ''}`);
  if (networkErrors > 0) errParts.push(`${networkErrors} failed network request${networkErrors > 1 ? 's' : ''}`);
  immediateActions.push(`**Resolve Errors** — fix ${errParts.join(' and ')}.`);
}

const designImprovements = [];

if (orphanedHeadings.length > 0) {
  designImprovements.push(`**Typography** — ${orphanedHeadings.length} heading${orphanedHeadings.length > 1 ? 's have' : ' has'} orphaned words; adjust line length or use non-breaking spaces.`);
}
if (headingSkipIssues > 0) {
  designImprovements.push(`**Heading Hierarchy** — ${headingSkipIssues} instance${headingSkipIssues > 1 ? 's' : ''} of skipped heading levels; ensure logical document structure.`);
}
if (brokenImagesRec.length > 0 || lowResImages.length > 0) {
  const imgParts = [];
  if (brokenImagesRec.length > 0) imgParts.push(`${brokenImagesRec.length} broken image${brokenImagesRec.length > 1 ? 's' : ''}`);
  if (lowResImages.length > 0) imgParts.push(`${lowResImages.length} low-resolution image${lowResImages.length > 1 ? 's' : ''}`);
  designImprovements.push(`**Images** — replace ${imgParts.join(' and ')} with high-quality versions.`);
}
if (includeFunctional) {
  designImprovements.push('**Spacing & Layout** — verify consistent padding/margins across all pages and test intermediate viewport sizes between 375px and 1920px.');
}

const perfImprovements = [];

if (loadTimeIssues) {
  const slowParts = [];
  if (report.mobile.loadTime > 3000) slowParts.push(`mobile (${report.mobile.loadTime}ms)`);
  if (report.desktop.loadTime > 2000) slowParts.push(`desktop (${report.desktop.loadTime}ms)`);
  perfImprovements.push(`**Load Time** — ${slowParts.join(' and ')} exceed targets; consider image optimisation, lazy loading, and CSS/JS minification.`);
}

markdown += `
---

## Recommendations

### Immediate Actions Required

`;

if (immediateActions.length === 0) {
  markdown += '✅ No immediate actions required.\n\n';
} else {
  immediateActions.forEach((action, i) => {
    markdown += `${i + 1}. ${action}\n\n`;
  });
}

if (includeFunctional && designImprovements.length > 0) {
  markdown += `### Design Improvements

`;
  designImprovements.forEach((item, i) => {
    markdown += `${i + 1}. ${item}\n\n`;
  });
}

if (includePerformance) {
  markdown += `### Performance Optimisations

`;
  if (perfImprovements.length === 0) {
    markdown += '✅ No performance issues detected.\n\n';
  } else {
    perfImprovements.forEach((item, i) => {
      markdown += `${i + 1}. ${item}\n\n`;
    });
  }
}

markdown += `
---

## Testing Notes

### Test Environment
- **Tool:** Playwright v1.54.1
- **Browser:** Chromium (headless)
- **Test Date:** ${new Date(report.timestamp).toLocaleString()}
- **Viewports:** Mobile (375px), Desktop (1920px)

### Coverage
${includeFunctional ? `- ✅ All major testing categories completed
- ✅ Both mobile and desktop viewports tested
- ✅ ${report.links.length} links validated (sample from ${report.desktop.links?.length} total)
- ✅ ${report.desktop.images?.length} images analyzed
- ✅ ${report.desktop.headings?.length} headings checked
` : ''}${includePerformance ? `- ✅ Console errors monitored
- ✅ Network requests analyzed
` : ''}${includeAccessibility ? `- ✅ Accessibility compliance checked (WCAG 2.2 Level AA)
` : ''}
### Raw Data
- Full JSON report: \`${inputFile}\`

---

## Summary

The ${websiteName} website has been tested across mobile and desktop viewports${includeFunctional ? ' with focus on functional and design quality' : ''}${includePerformance ? ', performance metrics' : ''}${includeAccessibility ? ', and accessibility compliance' : ''}.

**Key Strengths:**
- Page loads successfully on both viewports
${includeFunctional ? `- ${report.desktop.links?.length} links present for navigation
- ${report.desktop.images?.length} images support visual content
` : ''}
**Areas for Improvement:**
- ${report.issues.critical.length} critical issues require immediate attention
- ${report.issues.high.length} high priority issues impact user experience and SEO
- ${report.issues.medium.length} medium priority issues affect accessibility and design quality

**Overall Assessment:**
${report.issues.critical.length === 0 ? '✅ No critical issues blocking site launch' : '❌ Critical issues must be resolved before launch'}

---

*Report generated by Kosh, an automated testing tool.*
*Test Type: ${includeFunctional ? 'Functional & Design' : ''}${includePerformance ? (includeFunctional ? ', Performance' : 'Performance') : ''}${includeAccessibility ? (includeFunctional || includePerformance ? ', Accessibility' : 'Accessibility') : ''}${includeAll ? ' (All Tests)' : ''}*
`;

// Generate output filename based on website name, test type, and timestamp
const timestamp = new Date(report.timestamp).toISOString().split('T')[0];
const testTypeLabel = !includeAll && args.includes('--functional') ? 'FUNCTIONAL'
  : !includeAll && args.includes('--performance') ? 'PERFORMANCE'
  : !includeAll && args.includes('--accessibility') ? 'ACCESSIBILITY'
  : null;
const outputFilename = testTypeLabel
  ? `${websiteName.toUpperCase().replace(/\s+/g, '_')}_${testTypeLabel}_QA_REPORT_${timestamp}.md`
  : `${websiteName.toUpperCase().replace(/\s+/g, '_')}_QA_REPORT_${timestamp}.md`;
const reportsDir = require('path').join(__dirname, '../reports');

// Create reports directory if it doesn't exist
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const outputPath = reportsDir + '/' + outputFilename;

fs.writeFileSync(outputPath, markdown);
console.log(`Markdown report generated: ${outputPath}`);

// ============================================================
// AEO renderer
// Status-based evaluation report (no scoring). See skills/aeo/SKILL.md
// and schemas/qa-report-aeo-schema.json for the report contract.
// ============================================================

function renderAeoReport(report, inputFile) {
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

  const SIGNAL_LABELS = {
    robotsAndCrawlerAccess: 'robots.txt and AI crawler access',
    noNoindex: 'No noindex on homepage',
    httpsNoMixedContent: 'HTTPS, no mixed content',
    sitemapLastmod: 'Sitemap with valid lastmod dates',
    nojsAccessible: 'Core content accessible without JavaScript',
    canonicalUrls: 'Canonical URLs on homepage and inner pages',
    organizationSchema: 'Organization schema',
    primaryEntitySchema: 'Primary entity schema (content-driven)',
    relevantSchemasApplied: 'Relevant schemas applied (coverage of detected content types)',
    faqSchema: 'FAQ schema',
    jsonLdFormat: 'Structured-data format used (JSON-LD / microdata / RDFa)',
    openGraphTags: 'Open Graph tags complete',
    reviewSchema: 'Review or AggregateRating schema',
    directAnswers: 'Direct answers after headings',
    whoWhatWho: 'Who / what / who content',
    featuredSnippetStructure: 'Featured snippet structure',
    answerCapsules: 'Answer capsules (40–60 words under H2/H3)',
    faqSectionPresent: 'FAQ section present',
    faqSchemaApplied: 'FAQ schema applied',
    questionFramedHeadings: 'Question-framed headings',
    titleAndMetaQuestionMatch: 'Title and meta description question-match',
    namedTeamMembers: 'Named individuals with roles',
    authorCredentials: 'Author / staff credentials',
    authorBylines: 'Author bylines with Person schema',
    demonstratedExpertise: 'Demonstrated expertise',
    externalCitations: 'External citations or press',
    certificationBadges: 'Credentialing badges',
    namedExternalRelationships: 'Named external relationships',
    tenureIndicators: 'Tenure indicators (founded / since)',
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

  const signalLabel = (key) => SIGNAL_LABELS[key] || key;
  const statusIcon = (status) => {
    if (status === 'pass') return '✅';
    if (status === 'partial') return '⚠️';
    if (status === 'fail') return '❌';
    if (status === 'na') return '—';
    return '?';
  };

  const siteTypeLabel = SITE_TYPE_LABELS[report.siteType] || report.siteType || 'Other / Unknown';
  const summary = report.summary || { totalSignals: 0, pass: 0, partial: 0, fail: 0, na: 0 };

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

### Signal Evaluation

✅ **${summary.pass} pass** · ⚠️ **${summary.partial} partial** · ❌ **${summary.fail} fail** · — **${summary.na} N/A** &nbsp; (of ${summary.totalSignals} total)

### Pages Tested

${(report.visitedPages || []).map(p => `- ${esc(p)}`).join('\n') || '- (none recorded)'}

### Issues Summary

- **Critical:** ${report.issues.critical.length}
- **High:** ${report.issues.high.length}
- **Medium:** ${report.issues.medium.length}
- **Low:** ${report.issues.low.length}

---

## Detailed Findings

`;

  for (const [key, label] of CRITERION_ORDER) {
    const c = report.criteria?.[key];
    if (!c) continue;

    const signals = c.signals || {};
    const signalKeys = Object.keys(signals);
    const passCount = signalKeys.filter(k => signals[k].status === 'pass').length;
    const partialCount = signalKeys.filter(k => signals[k].status === 'partial').length;
    const failCount = signalKeys.filter(k => signals[k].status === 'fail').length;
    const naCount = signalKeys.filter(k => signals[k].status === 'na').length;

    md += `### ${label} — ${passCount} pass · ${partialCount} partial · ${failCount} fail${naCount ? ` · ${naCount} N/A` : ''}\n\n`;

    if (signalKeys.length === 0) {
      md += `*(No signal data recorded for this criterion.)*\n\n`;
      continue;
    }

    md += `| Signal | Status | Notes |\n`;
    md += `|---|---|---|\n`;

    for (const sigKey of signalKeys) {
      const sig = signals[sigKey];
      md += `| ${statusIcon(sig.status)} ${esc(signalLabel(sigKey))} | \`${esc(sig.status || '?')}\` | ${esc(sig.notes || '—')} |\n`;
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
    md += `What schema types this site's content suggests, and the relevance level the skill detected. Drives the \`primaryEntitySchema\` and \`relevantSchemasApplied\` evaluation.\n\n`;
    md += `| Schema | Relevance |\n|---|---|\n`;
    const relevanceOrder = { high: 0, medium: 1, low: 2, absent: 3 };
    const relevanceLabel = { high: '🟢 High', medium: '🟡 Medium', low: '⚪ Low', absent: '— Absent' };
    Object.entries(tn.applicableSchemas)
      .sort((a, b) => (relevanceOrder[a[1]] ?? 9) - (relevanceOrder[b[1]] ?? 9))
      .forEach(([schema, rel]) => {
        md += `| ${esc(schema)} | ${relevanceLabel[rel] || esc(rel)} |\n`;
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

Each signal at status \`fail\` or \`partial\` has a ready-to-use prompt the site owner can paste into Claude to start fixing the gap.

`;

  const prompts = report.actionablePrompts || [];
  if (prompts.length === 0) {
    md += `*(All signals at status pass or N/A — no actionable prompts to surface.)*\n\n`;
  } else {
    prompts.forEach((p, i) => {
      md += `### ${i + 1}. ${esc(signalLabel(p.signal))}\n\n`;
      md += `*Criterion: ${esc(p.criterion)}*\n\n`;
      md += `**Issue:** ${esc(p.issue)}\n\n`;
      md += `**Impact:** ${esc(p.impact)}\n\n`;
      md += `**Prompt:**\n\n`;
      md += '```\n';
      md += p.prompt;
      md += '\n```\n\n';
    });
  }

  md += `---

## Quick Wins (Low Effort)

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
- **Rubric:** AEO ${esc(report.aeoRubricVersion)} — 49 signals across 8 criteria, status-based evaluation (no scoring), site-type-aware

### Raw Data

- Full JSON report: \`${inputFile}\`

---

## Summary

${websiteName} was evaluated across 8 criteria and ${summary.totalSignals} AEO signals. ${summary.pass} signals passed, ${summary.partial} were partial, ${summary.fail} failed${summary.na ? `, and ${summary.na} were N/A` : ''}.

**Issue Counts:**

- ${report.issues.critical.length} critical issues blocking AI discoverability
- ${report.issues.high.length} high priority issues weakening AI understanding
- ${report.issues.medium.length} medium priority improvements
- ${report.issues.low.length} low priority polish

---

*Report generated by Kosh, an automated testing tool.*
*Test Type: AEO / AI Mode (rubric ${esc(report.aeoRubricVersion)})*
`;

  const parsedTimestamp = new Date(report.timestamp);
  const aeoTimestamp = Number.isNaN(parsedTimestamp.getTime())
    ? new Date().toISOString().split('T')[0]
    : parsedTimestamp.toISOString().split('T')[0];
  const slug = websiteName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_-]/g, '');
  const aeoOutputFilename = `${slug}_AEO_QA_REPORT_${aeoTimestamp}.md`;
  const aeoReportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(aeoReportsDir)) fs.mkdirSync(aeoReportsDir, { recursive: true });

  const aeoOutputPath = path.join(aeoReportsDir, aeoOutputFilename);
  fs.writeFileSync(aeoOutputPath, md);
  console.log(`Markdown report generated: ${aeoOutputPath}`);
}
