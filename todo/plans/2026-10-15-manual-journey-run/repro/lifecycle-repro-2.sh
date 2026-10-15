#!/bin/bash
# repro-2.sh — journey 2 shares journey 12's defect: see repro-12.sh (same editor-to-init path, a stack declaring a sub-agent with no skills).
exec "$(dirname "$0")/repro-12.sh" "$@"
