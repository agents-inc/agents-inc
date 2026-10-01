#!/usr/bin/env python3
"""Partition the uncommitted code in the CLI monorepo into disjoint review lanes.

Run at LAUNCH time, not before: earlier lanes add files. Every file lands in exactly one lane; the
script refuses to emit a partition that drops or doubles a file.

    python3 partition.py source > source-lanes.json
    python3 partition.py tests  > test-lanes.json
"""
import json
import re
import subprocess
import sys

CLI = "/home/vince/dev/cli"
CODE = re.compile(r"\.(ts|tsx|mts|mjs)$")
# Written by a generator, never by hand -- a hand refactor is lost on the next regeneration and
# turns its generate:*:check gate red. Excluded from every lane.
GENERATED = ("packages/compile/src/generated/", "packages/matrix/src/vendor/", "src/cli/types/generated/")
TEST = re.compile(r"\.(test|spec)\.(ts|tsx)$|/__tests__/|/__mocks__/|(^|/)e2e/")


def uncommitted_code():
    out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"],
                         cwd=CLI, capture_output=True, text=True, check=True).stdout
    paths = []
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1]
        if CODE.search(path) and "/dist/" not in path and "/node_modules/" not in path \
                and not any(g in path for g in GENERATED):
            paths.append(path)
    return sorted(set(paths))


# (lane id, role, predicate). First match wins, so order is specific -> general.
SOURCE_LANES = [
    ("src-hosts-installation", "cli-developer",
     lambda p: p.startswith(("packages/cli/src/cli/lib/hosts/", "packages/cli/src/cli/lib/installation/"))),
    ("src-ops-agents-config", "cli-developer",
     lambda p: p.startswith(tuple("packages/cli/src/cli/lib/" + d + "/" for d in
                                  ("operations", "agents", "configuration", "config-gate")))),
    ("src-lib-rest", "cli-developer", lambda p: p.startswith("packages/cli/src/cli/lib/")),
    ("src-compile-matrix", "cli-developer", lambda p: p.startswith(("packages/compile/", "packages/matrix/"))),
    ("src-editor-ui", "web-developer", lambda p: p.startswith(("apps/", "packages/ui/"))),
    ("src-cli-top", "cli-developer", lambda p: p.startswith("packages/cli/")),
]

TEST_LANES = [
    ("test-e2e-commands", "cli-tester", lambda p: p.startswith("packages/cli/e2e/commands/")),
    ("test-e2e-lifecycle", "cli-tester", lambda p: p.startswith("packages/cli/e2e/lifecycle/")),
    ("test-e2e-infra-and-rest", "cli-tester", lambda p: p.startswith("packages/cli/e2e/")),
    ("test-lib-journeys-and-helpers", "cli-tester",
     lambda p: p.startswith("packages/cli/src/cli/lib/__tests__/")),
    ("test-lib-hosts-installation-agents", "cli-tester",
     lambda p: p.startswith(tuple("packages/cli/src/cli/lib/" + d + "/" for d in
                                  ("hosts", "installation", "agents", "codex")))),
    ("test-lib-rest", "cli-tester", lambda p: p.startswith("packages/cli/src/cli/lib/")),
    ("test-editor", "web-tester", lambda p: p.startswith(("apps/editor/", "packages/ui/"))),
    ("test-misc", "cli-tester", lambda p: True),
]


def partition(kind):
    files = [p for p in uncommitted_code() if bool(TEST.search(p)) == (kind == "tests")]
    lanes = SOURCE_LANES if kind == "source" else TEST_LANES
    buckets = {lid: {"id": lid, "role": role, "files": []} for lid, role, _ in lanes}
    for path in files:
        for lid, _, pred in lanes:
            if pred(path):
                buckets[lid]["files"].append(path)
                break
        else:
            sys.exit("unassigned: " + path)
    placed = [f for b in buckets.values() for f in b["files"]]
    assert sorted(placed) == sorted(files) and len(placed) == len(set(placed)), "drop or double"
    return [b for b in buckets.values() if b["files"]]


if __name__ == "__main__":
    result = partition(sys.argv[1])
    json.dump(result, sys.stdout, indent=1)
    sys.stderr.write("\n".join(f"{b['id']:36} {b['role']:14} {len(b['files'])}" for b in result) + "\n")
    sys.stderr.write(f"total {sum(len(b['files']) for b in result)}\n")
