---
type: missing-standard
severity: medium
affected_files:
  - turbo.json
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-10-26
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

A lane gate said to run `npx turbo run lint typecheck test --filter=agents-inc --force` again at a
120-column terminal, under `script -qec "stty cols 120 rows 40; …"`, inside the shared CLI lock.
`turbo.json` sets `"ui": "tui"`, so inside `script` turbo opened its full-screen view instead of
streaming. Started from a background shell with nobody at the terminal, it wrote nothing and did not
exit:

- the `script` log stayed at 0 bytes for 25 minutes, and the turbo process had no child task left
  running;
- SIGTERM did not stop it, and SIGKILL did (`script` exit 137);
- every other lane waiting on the lock waited too. Only the `timeout 2400` around the lock would have
  ended it.

The same command with `--ui=stream` added, run from the same kind of shell, finished in 1m19s and
wrote the full task output (3.4 MB log, turbo's `Tasks:` and `Failed:` lines, exit 2 for others'
reds). The headless run of the same command, without `script`, streams anyway because its output
is not a terminal, and finished in about 3 minutes.

Not established: why the full-screen view never exited. The evidence above only shows that it did
not, and that `--ui=stream` avoids it.

## Fix Applied

Nothing in the tree changed. That lane's 120-column run passed `--ui=stream`.

## Proposed Standard

Every gate that runs turbo inside a pseudo-terminal passes `--ui=stream`:

```
script -qec "stty cols 120 rows 40; npx turbo run lint typecheck test --filter=agents-inc --force --ui=stream" /dev/null
```

This belongs wherever the 120-column gate is written down, which today is only in briefs. Runs
that skip turbo, like `bun run test` in the package
(`2026-10-22-specs-passed-without-a-terminal-and-failed-in-a-wider-one`), are not affected.
Checked against `CLAUDE.md`: it conflicts with nothing.
