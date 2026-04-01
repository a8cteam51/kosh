#!/bin/bash
# Plays a notification sound when Claude Code needs permission approval.
# Skips playback if the terminal window is already focused.
#
# Mute by creating an empty file:  touch assets/mute

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SOUND_FILE="$PROJECT_ROOT/assets/notification.wav"

if [[ -f "$PROJECT_ROOT/assets/mute" || ! -f "$SOUND_FILE" ]]; then
  exit 0
fi

FRONTMOST=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

case "$FRONTMOST" in
  Terminal|iTerm2|Ghostty|Alacritty|kitty|WezTerm) ;; # already focused — skip
  *) afplay -v 0.51 "$SOUND_FILE" &;;
esac

exit 0
