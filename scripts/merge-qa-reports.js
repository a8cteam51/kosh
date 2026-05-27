#!/usr/bin/env node

/**
 * QA Reports Merger
 * Combines functional, performance, and accessibility reports into one comprehensive report
 *
 * Usage: node merge-qa-reports.js <functional.json> <performance.json> <accessibility.json>
 */

const fs = require('fs');
const path = require('path');

// Get file paths from command line arguments
const functionalPath = process.argv[2];
const performancePath = process.argv[3];
const accessibilityPath = process.argv[4];

if (!functionalPath || !performancePath || !accessibilityPath) {
  console.error('Usage: node merge-qa-reports.js <functional.json> <performance.json> <accessibility.json>');
  process.exit(1);
}

// Read JSON files
let functional, performance, accessibility;

try {
  functional = JSON.parse(fs.readFileSync(functionalPath, 'utf8'));
  performance = JSON.parse(fs.readFileSync(performancePath, 'utf8'));
  accessibility = JSON.parse(fs.readFileSync(accessibilityPath, 'utf8'));
} catch (error) {
  console.error('Error reading JSON files:', error.message);
  process.exit(1);
}

// Merge the reports into a single comprehensive report
const mergedReport = {
  // Use functional as base for metadata; fall through to performance/a11y for environment if missing.
  url: functional.url,
  websiteName: functional.websiteName,
  timestamp: functional.timestamp,
  environment: functional.environment || performance.environment || accessibility.environment,
  testMethodology: functional.testMethodology,
  visitedPages: functional.visitedPages,

  // Merge viewport data from all three reports
  mobile: {
    ...functional.mobile,
    console: performance.mobile?.console || [],
    network: performance.mobile?.network || [],
    a11y: accessibility.mobile?.a11y || []
  },
  desktop: {
    ...functional.desktop,
    console: performance.desktop?.console || [],
    network: performance.desktop?.network || [],
    a11y: accessibility.desktop?.a11y || []
  },

  // Keep metadata from functional
  metadata: functional.metadata,

  // Keep validated links from functional
  links: functional.links,

  // Merge all issues by priority level, flattened structure
  issues: {
    critical: mergeIssues(
      functional.issues?.critical || [],
      performance.issues?.critical || [],
      accessibility.issues?.critical || []
    ),
    high: mergeIssues(
      functional.issues?.high || [],
      performance.issues?.high || [],
      accessibility.issues?.high || []
    ),
    medium: mergeIssues(
      functional.issues?.medium || [],
      performance.issues?.medium || [],
      accessibility.issues?.medium || []
    ),
    low: mergeIssues(
      functional.issues?.low || [],
      performance.issues?.low || [],
      accessibility.issues?.low || []
    )
  }
};

/**
 * Merge issues from multiple sources
 * Combines functional, performance, and accessibility issues
 * @param {...Array} issueLists - Variable number of issue arrays
 * @returns {Array} Merged and deduplicated issues
 */
function mergeIssues(...issueLists) {
  const merged = [];
  const seen = new Set();

  for (const list of issueLists) {
    for (const issue of list) {
      // Create a unique key for deduplication
      const key = `${issue.category}|${issue.issue}`;

      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          category: issue.category,
          issue: issue.issue,
          impact: issue.impact,
          device: issue.device || 'both',
          pages: issue.pages || [],
          // Include optional fields if present
          ...(issue.metric && { metric: issue.metric }),
          ...(issue.wcag_criterion && { wcag_criterion: issue.wcag_criterion })
        });
      }
    }
  }

  return merged;
}

// Output merged report as JSON
console.log(JSON.stringify(mergedReport, null, 2));
