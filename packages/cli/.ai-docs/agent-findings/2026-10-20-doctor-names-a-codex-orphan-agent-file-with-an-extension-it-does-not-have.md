---
type: convention-drift
severity: low
affected_files:
  - src/cli/commands/doctor.ts
  - src/cli/lib/doctor/ownership.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Landed: the orphan row prints each file name as listed from disk (unclaimedAgentFiles, now in
  lib/doctor/ownership.ts), so a Codex orphan reads `.toml`, and doctor-content.test.ts pins it on a
  Codex installation. Pending: the triage of the candidate sites the second grep below lists.
---

## What Was Wrong

`checkNoOrphans` in `commands/doctor.ts` lists agent files through the provider's `AgentCodec`
(`listAgentFilesOf(dir, codec)`, then `path.basename(fileName, codec.extension)`), and then prints
each orphan as `` `- ${f}.md (not in config)` ``. On a Codex installation the file is `.toml`, so the
row names a file that is not on disk. CLAUDE.md's rule for path blocks is that a user can copy a line
out and find it; this line cannot be.

Reproduction (built bin, isolated `HOME`, 2026-10-20): a project holding
`.agents-inc/codex/config.ts` with one project-scope agent and a stray
`.codex/agents/stray-agent.toml`. `node dist/index.js doctor` printed:

```
    No Orphans              !  1 orphaned agent file
                               - stray-agent.md (not in config)
```

and `ls .codex/agents` printed `stray-agent.toml`.

No spec covers it: every assertion on `(not in config)` runs on a Claude installation.

```
grep -rn "not in config" src e2e --include='*.ts' --include='*.tsx'
```

Candidates in the same class, NOT verified per site (each may be Claude-only by design): agent file
names built with a literal `.md` or a local `AGENT_FILE_EXTENSION = ".md"` while a codec exists.

```
grep -rnE '\}\.md\b|AGENT_FILE_EXTENSION' src/cli --include='*.ts' --include='*.tsx' | grep -v __tests__
```

## Fix Applied

None — discovery only. Found during a behaviour-preserving refactor of `doctor.ts`, which left the
line as it was.

## Proposed Standard

Fix: print `` `- ${f}${codec.extension} (not in config)` `` and add a Codex orphan spec beside the
Claude ones in `src/cli/lib/__tests__/commands/doctor.test.ts`. Then triage each candidate above:
use the codec where the path can be a Codex one, or record on the site that it is Claude-only. No
new CLAUDE.md rule proposed; the existing path-block rule already covers it.
