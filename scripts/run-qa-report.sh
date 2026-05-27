#!/bin/bash

# QA Report Generation Workflow Script
# Reads a kosh JSON report and emits a self-contained HTML report.
#
# Usage:
#   ./run-qa-report.sh <path-to-json> [--functional] [--performance] [--accessibility]
#
# Examples:
#   ./run-qa-report.sh qa-report-functional-wholyme.json --functional
#   ./run-qa-report.sh qa-report.json --performance
#   ./run-qa-report.sh qa-report.json --functional --performance --accessibility
#   ./run-qa-report.sh qa-report.json (auto-detects test type from filename)

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
QA_REPORT_JSON="${1:-reports/data/qa-report.json}"
REPORTS_DIR="./reports"
SCRIPT_PATH="$(dirname "$0")/generate-report.js"

# Extract test type flags (everything after the JSON file argument)
TEST_TYPE_FLAGS="${@:2}"

# Validate inputs
if [ ! -f "$QA_REPORT_JSON" ]; then
  echo -e "${RED}Error: JSON file not found at $QA_REPORT_JSON${NC}"
  echo "Usage: ./run-qa-report.sh [path-to-qa-report.json]"
  exit 1
fi

if [ ! -f "$SCRIPT_PATH" ]; then
  echo -e "${RED}Error: generate-report.js script not found at $SCRIPT_PATH${NC}"
  exit 1
fi

# Create reports directory if it doesn't exist
if [ ! -d "$REPORTS_DIR" ]; then
  mkdir -p "$REPORTS_DIR"
  echo -e "${BLUE}Created reports directory${NC}"
fi

# Step 1: Validate JSON structure
echo -e "${BLUE}Step 1: Validating JSON structure...${NC}"
if ! node -e "JSON.parse(require('fs').readFileSync('$QA_REPORT_JSON', 'utf8')); console.log('✓ JSON is valid')" 2>/dev/null; then
  echo -e "${RED}Error: Invalid JSON in $QA_REPORT_JSON${NC}"
  exit 1
fi

# Step 2: Extract metadata from JSON
echo -e "${BLUE}Step 2: Extracting metadata from JSON...${NC}"
WEBSITE_NAME=$(node -e "console.log(require('fs').readFileSync('$QA_REPORT_JSON', 'utf8').split('\"websiteName\": \"')[1].split('\"')[0])")
TIMESTAMP=$(node -e "console.log(require('fs').readFileSync('$QA_REPORT_JSON', 'utf8').split('\"timestamp\": \"')[1].split('\"')[0])")
echo -e "${GREEN}  Website: $WEBSITE_NAME${NC}"
echo -e "${GREEN}  Timestamp: $TIMESTAMP${NC}"

# Step 3: Run generate-report.js script
echo -e "${BLUE}Step 3: Generating HTML report using generate-report.js...${NC}"

# Auto-detect test type from filename if no flags provided
if [ -z "$TEST_TYPE_FLAGS" ]; then
  BASENAME=$(basename "$QA_REPORT_JSON")
  if [[ "$BASENAME" == *"functional"* ]]; then
    TEST_TYPE_FLAGS="--functional"
  elif [[ "$BASENAME" == *"performance"* ]]; then
    TEST_TYPE_FLAGS="--performance"
  elif [[ "$BASENAME" == *"accessibility"* ]]; then
    TEST_TYPE_FLAGS="--accessibility"
  fi
fi

if [ -z "$TEST_TYPE_FLAGS" ]; then
  echo -e "${YELLOW}  Note: No test type flags specified. Including all available test data.${NC}"
  node "$SCRIPT_PATH" "$QA_REPORT_JSON"
else
  echo -e "${YELLOW}  Test type: $TEST_TYPE_FLAGS${NC}"
  node "$SCRIPT_PATH" "$QA_REPORT_JSON" $TEST_TYPE_FLAGS
fi

# Step 4: Verify output was created
WEBSITE_NAME_UPPER=$(echo "$WEBSITE_NAME" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')
REPORT_DATE=$(echo "$TIMESTAMP" | cut -d'T' -f1)
if [[ "$TEST_TYPE_FLAGS" == "--functional" ]]; then
  TEST_TYPE_LABEL="FUNCTIONAL"
elif [[ "$TEST_TYPE_FLAGS" == "--performance" ]]; then
  TEST_TYPE_LABEL="PERFORMANCE"
elif [[ "$TEST_TYPE_FLAGS" == "--accessibility" ]]; then
  TEST_TYPE_LABEL="ACCESSIBILITY"
else
  TEST_TYPE_LABEL=""
fi
if [ -n "$TEST_TYPE_LABEL" ]; then
  REPORT_FILE="$REPORTS_DIR/${WEBSITE_NAME_UPPER}_${TEST_TYPE_LABEL}_QA_REPORT_${REPORT_DATE}.html"
else
  REPORT_FILE="$REPORTS_DIR/${WEBSITE_NAME_UPPER}_QA_REPORT_${REPORT_DATE}.html"
fi
if [ -f "$REPORT_FILE" ]; then
  echo -e "${GREEN}✓ Report successfully generated!${NC}"
  echo -e "${BLUE}Report location: $REPORT_FILE${NC}"

  # Display report statistics (extract counts from the JSON source)
  echo -e "${BLUE}Report Statistics:${NC}"
  CRITICAL_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$QA_REPORT_JSON','utf8')); console.log(r.issues.critical.length)")
  HIGH_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$QA_REPORT_JSON','utf8')); console.log(r.issues.high.length)")
  MEDIUM_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$QA_REPORT_JSON','utf8')); console.log(r.issues.medium.length)")
  LOW_COUNT=$(node -e "const r=JSON.parse(require('fs').readFileSync('$QA_REPORT_JSON','utf8')); console.log(r.issues.low.length)")

  echo -e "  ${YELLOW}Critical Issues:${NC} $CRITICAL_COUNT"
  echo -e "  ${YELLOW}High Priority Issues:${NC} $HIGH_COUNT"
  echo -e "  ${YELLOW}Medium Priority Issues:${NC} $MEDIUM_COUNT"
  echo -e "  ${YELLOW}Low Priority Issues:${NC} $LOW_COUNT"

  echo -e "${GREEN}Workflow complete! ✓${NC}"
else
  echo -e "${RED}Error: Report file was not generated${NC}"
  exit 1
fi
