#!/bin/bash

# QA Report Generation Workflow Script
# Reads a kosh JSON report and emits a self-contained HTML report.
#
# Usage:
#   ./run-qa-report.sh <path-to-json> [--functional] [--performance] [--accessibility] [--shop]
#
# Examples:
#   ./run-qa-report.sh qa-report-functional.json --functional
#   ./run-qa-report.sh qa-report-shop.json --shop
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
  elif [[ "$BASENAME" == *"shop"* ]]; then
    TEST_TYPE_FLAGS="--shop"
  fi
fi

if [ -z "$TEST_TYPE_FLAGS" ]; then
  echo -e "${YELLOW}  Note: No test type flags specified. Including all available test data.${NC}"
else
  echo -e "${YELLOW}  Test type: $TEST_TYPE_FLAGS${NC}"
fi

# Capture the generator's output so Step 4 reads back the path it prints rather than
# rebuilding the filename with a slug rule that can drift from the generator's.
GENERATE_OUTPUT=$(node "$SCRIPT_PATH" "$QA_REPORT_JSON" $TEST_TYPE_FLAGS)
echo "$GENERATE_OUTPUT"

# Step 4: Verify output was created
REPORT_FILE=$(printf '%s\n' "$GENERATE_OUTPUT" | sed -n 's/^HTML report generated: //p' | tail -1)
if [ -n "$REPORT_FILE" ] && [ -f "$REPORT_FILE" ]; then
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

  # Step 5: Archive the source JSON under the HTML's basename; qa-report-<type>.json is overwritten by every run.
  ARCHIVE_DIR="$(dirname "$REPORT_FILE")/data/archive"
  ARCHIVE_JSON="$ARCHIVE_DIR/$(basename "${REPORT_FILE%.html}").json"

  # The HTML name carries only a date, so a same-day rerun moves the previous run aside under its own timestamp.
  if [ -e "$ARCHIVE_JSON" ] && ! cmp -s "$QA_REPORT_JSON" "$ARCHIVE_JSON"; then
    OLD_STAMP=$(node -p "JSON.parse(require('fs').readFileSync('$ARCHIVE_JSON','utf8')).timestamp" | tr -c 'A-Za-z0-9\n' '-')
    mv "$ARCHIVE_JSON" "${ARCHIVE_JSON%.json}_$OLD_STAMP.json"
  fi

  if mkdir -p "$ARCHIVE_DIR" && cp "$QA_REPORT_JSON" "$ARCHIVE_JSON"; then
    echo -e "${BLUE}Source data archived: $ARCHIVE_JSON${NC}"
  else
    echo -e "${YELLOW}Warning: could not archive source JSON to $ARCHIVE_JSON${NC}"
  fi

  echo -e "${GREEN}Workflow complete! ✓${NC}"
else
  echo -e "${RED}Error: Report file was not generated${NC}"
  exit 1
fi
