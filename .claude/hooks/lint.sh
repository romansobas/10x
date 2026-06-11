#!/usr/bin/env bash
# PostToolUse lint hook — runs ESLint on the edited file.
# Exit 2 feeds the error output back to the agent as additionalContext.
FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))")
[[ "$FILE" =~ \.(ts|tsx|astro)$ ]] || exit 0
cd /private/var/www/10x && npx eslint --max-warnings 0 "$FILE" || exit 2
