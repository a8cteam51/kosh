#!/bin/bash

# QA Reports Merge Script
# Merges functional, performance, and accessibility reports into one comprehensive report

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
FUNCTIONAL_JSON="${1:-reports/data/qa-report-functional.json}"
PERFORMANCE_JSON="${2:-reports/data/qa-report-performance.json}"
ACCESSIBILITY_JSON="${3:-reports/data/qa-report-accessibility.json}"
REPORTS_DIR="./reports"
MERGE_SCRIPT_PATH="$(dirname "$0")/merge-qa-reports.js"

echo -e "${BLUE}=== QA Reports Merge Workflow ===${NC}\n"

# Validate inputs
echo -e "${BLUE}Step 1: Validating input files...${NC}"

if [ ! -f "$FUNCTIONAL_JSON" ]; then
  echo -e "${RED}Error: Functional JSON not found at $FUNCTIONAL_JSON${NC}"
  echo "Usage: ./merge-qa-reports.sh [functional-json] [performance-json] [accessibility-json]"
  exit 1
fi

if [ ! -f "$PERFORMANCE_JSON" ]; then
  echo -e "${RED}Error: Performance JSON not found at $PERFORMANCE_JSON${NC}"
  echo "Usage: ./merge-qa-reports.sh [functional-json] [performance-json] [accessibility-json]"
  exit 1
fi

if [ ! -f "$ACCESSIBILITY_JSON" ]; then
  echo -e "${RED}Error: Accessibility JSON not found at $ACCESSIBILITY_JSON${NC}"
  echo "Usage: ./merge-qa-reports.sh [functional-json] [performance-json] [accessibility-json]"
  exit 1
fi

echo -e "${GREEN}✓ All input files found${NC}"

# Validate JSON syntax
echo -e "${BLUE}Step 2: Validating JSON syntax...${NC}"

if ! node -e "JSON.parse(require('fs').readFileSync('$FUNCTIONAL_JSON', 'utf8')); console.log('✓ Functional JSON is valid')" 2>/dev/null; then
  echo -e "${RED}Error: Invalid JSON in $FUNCTIONAL_JSON${NC}"
  exit 1
fi

if ! node -e "JSON.parse(require('fs').readFileSync('$PERFORMANCE_JSON', 'utf8')); console.log('✓ Performance JSON is valid')" 2>/dev/null; then
  echo -e "${RED}Error: Invalid JSON in $PERFORMANCE_JSON${NC}"
  exit 1
fi

if ! node -e "JSON.parse(require('fs').readFileSync('$ACCESSIBILITY_JSON', 'utf8')); console.log('✓ Accessibility JSON is valid')" 2>/dev/null; then
  echo -e "${RED}Error: Invalid JSON in $ACCESSIBILITY_JSON${NC}"
  exit 1
fi

echo -e "${GREEN}✓ All JSON files are valid${NC}"

# Extract metadata from functional JSON (primary source)
echo -e "${BLUE}Step 3: Extracting metadata...${NC}"
WEBSITE_NAME=$(node -e "console.log(require('fs').readFileSync('$FUNCTIONAL_JSON', 'utf8').split('\"websiteName\": \"')[1].split('\"')[0])")
TIMESTAMP=$(node -e "console.log(require('fs').readFileSync('$FUNCTIONAL_JSON', 'utf8').split('\"timestamp\": \"')[1].split('\"')[0])")

echo -e "${GREEN}  Website: $WEBSITE_NAME${NC}"
echo -e "${GREEN}  Timestamp: $TIMESTAMP${NC}"

# Create reports directory if it doesn't exist
if [ ! -d "$REPORTS_DIR" ]; then
  mkdir -p "$REPORTS_DIR"
  echo -e "${BLUE}Created reports directory${NC}"
fi

# Check if merge script exists
if [ ! -f "$MERGE_SCRIPT_PATH" ]; then
  echo -e "${RED}Error: Merge script not found at $MERGE_SCRIPT_PATH${NC}"
  exit 1
fi

# Run merge script to create merged JSON
echo -e "${BLUE}Step 4: Merging QA reports...${NC}"
MERGED_JSON=$(mktemp)

node "$MERGE_SCRIPT_PATH" "$FUNCTIONAL_JSON" "$PERFORMANCE_JSON" "$ACCESSIBILITY_JSON" > "$MERGED_JSON"

echo -e "${GREEN}✓ Reports merged successfully${NC}"

# Run generate-report.js to create final HTML report
echo -e "${BLUE}Step 5: Generating HTML report...${NC}"

GENERATE_SCRIPT_PATH="$(dirname "$0")/generate-report.js"
if [ ! -f "$GENERATE_SCRIPT_PATH" ]; then
  echo -e "${RED}Error: generate-report.js script not found${NC}"
  rm -f "$MERGED_JSON"
  exit 1
fi

node "$GENERATE_SCRIPT_PATH" "$MERGED_JSON"

# Verify output was created
WEBSITE_NAME_UPPER=$(echo "$WEBSITE_NAME" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')
REPORT_DATE=$(echo "$TIMESTAMP" | cut -d'T' -f1)
REPORT_FILE="$REPORTS_DIR/${WEBSITE_NAME_UPPER}_QA_REPORT_${REPORT_DATE}.html"

if [ -f "$REPORT_FILE" ]; then
  echo -e "${GREEN}✓ Report successfully generated!${NC}"
  echo -e "${BLUE}Report location: $REPORT_FILE${NC}"

  # Display report statistics (extract counts from the merged JSON)
  echo -e "${BLUE}Report Statistics:${NC}"
  CRITICAL_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$MERGED_JSON','utf8')); console.log(r.issues.critical.length)")
  HIGH_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$MERGED_JSON','utf8')); console.log(r.issues.high.length)")
  MEDIUM_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$MERGED_JSON','utf8')); console.log(r.issues.medium.length)")
  LOW_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$MERGED_JSON','utf8')); console.log(r.issues.low.length)")

  echo -e "  ${YELLOW}Critical Issues:${NC} $CRITICAL_COUNT"
  echo -e "  ${YELLOW}High Priority Issues:${NC} $HIGH_COUNT"
  echo -e "  ${YELLOW}Medium Priority Issues:${NC} $MEDIUM_COUNT"
  echo -e "  ${YELLOW}Low Priority Issues:${NC} $LOW_COUNT"

  echo -e "${GREEN}Merge workflow complete! ✓${NC}"

  # Cleanup temporary merged JSON
  rm -f "$MERGED_JSON"
else
  echo -e "${RED}Error: Report file was not generated${NC}"
  rm -f "$MERGED_JSON"
  exit 1
fi
