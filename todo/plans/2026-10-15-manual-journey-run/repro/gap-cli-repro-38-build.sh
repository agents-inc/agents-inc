#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Journey 38's `build` leg: `build marketplace` over a marketplace repo whose own .agents-inc/config.ts
# does not parse rewrites .claude-plugin/marketplace.json, THEN refuses at catalog.json with exit 1
# (ERROR = "nothing landed") and an installation remedy (uninstall / init) that does not apply to a
# marketplace repo. marketplace.json and catalog.json are left describing different builds.
# Also shown: an installation config the build never reads (global, broken) changes nothing.
# Needs: the built CLI only (no worker, no network).
set -u
CLI=${CLI:-$REPO/packages/cli/dist/index.js}
export AGENTS_INC_SKIP_NEW_VERSION_CHECK=1
W=/tmp/c924/repro-38-build-$$; export HOME=$W/h; mkdir -p $HOME/mk
ai() { node "$CLI" "$@" </dev/null 2>&1; echo "EXIT=$?"; }
cd $HOME/mk && ai new marketplace rb >/dev/null
M=$HOME/mk/rb; sed -i 's/"@rb"/"@someone"/' $M/package.json; cd $M
ai build plugins | tail -1; ai build marketplace | tail -1
cp .claude-plugin/marketplace.json $W/mj.before; cp .claude-plugin/catalog.json $W/cj.before
sed -i 's/"version": "0.1.0"/"version": "0.2.0"/' package.json
mkdir -p .agents-inc; printf "export default {{{ skillsDir: 'src/skills' }\n" > .agents-inc/config.ts
echo "--- build marketplace over an unparseable .agents-inc/config.ts:"
ai build marketplace | sed -n '/Writing marketplace/,$p'
echo "--- marketplace.json changed by the refused run:"; diff $W/mj.before .claude-plugin/marketplace.json
echo "--- catalog.json changed by the refused run:"; cmp -s $W/cj.before .claude-plugin/catalog.json && echo "no (stale)" || echo yes
echo "EXPECTED: refuse before writing anything (or account for the partial write with exit 5), and a remedy for a marketplace's own config, not uninstall/init."
echo "--- an empty .agents-inc/config.ts is read as absent (no line):"
: > .agents-inc/config.ts; ai build marketplace | tail -2
echo "--- doctor in the same repo, config unparseable again (the remedy says doctor reports the file):"
printf "export default {{{ skillsDir: 'src/skills' }\n" > .agents-inc/config.ts
ai doctor | grep -n "Check threw\|Operational checks\|^    Error:\|Caused by\|Summary\|EXIT"
echo "EXPECTED: doctor names the file in its report and finishes with a Summary; observed: 'Check threw', then the Operational section dies on the raw error chain, no Summary."
