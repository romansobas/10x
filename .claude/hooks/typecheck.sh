#!/usr/bin/env bash
# PostToolUse typecheck hook — runs tsc --noEmit on the whole project.
# Exit 2 feeds type errors back to the agent as additionalContext.
FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")
[[ "$FILE" =~ \.(ts|tsx|astro)$ ]] || exit 0
cd /private/var/www/10x && npx tsc --noEmit || exit 2
