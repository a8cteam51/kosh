#!/bin/sh
# Plugin hooks run on every Bash and edit call in every project, so Node starts only when a rule in guard-capture.js could match.
input=$(cat)
# Only tool_input can trip a rule; the transcript path always ends in .jsonl and the cwd can hold any word. Inside a JSON string a key's quotes are escaped, so this never cuts tool_input.
printf '%s' "$input" \
  | sed -E 's/"(transcript_path|agent_transcript_path|cwd)"[[:space:]]*:[[:space:]]*"[^"]*"//g' \
  | grep -qiE 'capture|links|jsonl|kosh-reports' || exit 0
if ! command -v node >/dev/null 2>&1; then
  echo "Blocked: kosh's capture guard needs node on PATH to check this call." >&2
  exit 2
fi
printf '%s' "$input" | node "$(dirname "$0")/guard-capture.js"
