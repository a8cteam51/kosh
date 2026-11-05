#!/bin/sh
# Plugin hooks run on every Bash and edit call in every project, so Node starts only when a rule in guard-capture.js could match.
input=$(cat)
# The guard reads only command and file_path, so the transcript path (always .jsonl), the cwd and an edit's text never count. A key quoted inside a JSON string is escaped, so only real keys match.
printf '%s' "$input" \
  | grep -oE '"(file_path|command)"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' \
  | grep -qiE 'capture|links|jsonl|kosh-reports' || exit 0
if ! command -v node >/dev/null 2>&1; then
  echo "Blocked: kosh's capture guard needs node on PATH to check this call." >&2
  exit 2
fi
printf '%s' "$input" | node "$(dirname "$0")/guard-capture.js"
