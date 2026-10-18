---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/edit-from-says-what-it-did.test.ts
  - src/cli/commands/edit.tsx
standards_docs:
  - CLAUDE.md
date: 2026-10-18
reporting_agent: web-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

A spec that pins a block of output with `toContain([...lines, ""].join("\n"))` ends its expected
text with the newline after the block's last line. Any line the command prints next still
contains that text, so the spec cannot see an extra line under the block — which is exactly the
shape of a double report.

"gives a sub-agent moved into the project its own copy, and keeps the global one" in
`edit-from-says-what-it-did.test.ts` pins `Changes:` / `+ web-developer [P] (agent)` that way.
On the build before this pass's edit fix, the same setup printed
`~ web-developer (agent: skills reassigned)` directly under it (seen in the output of the new
tuned-copy spec, which shares the setup), and the spec stayed green.

Census (a script over `src/cli/lib/__tests__/commands/*.test.ts`, every `toContain([...].join("\n"))`
whose array holds `"Changes:"` and ends on one `""` rather than two): two hits —
`edit-from-says-what-it-did.test.ts` (the spec above) and `edit-from-plugins-says-what-it-did.test.ts`
("switches a local copy back to a plugin"), where the `Changes:` block is closed by the lines that
follow it, so only the first is open. A census, of `Changes:` blocks only; blocks under other
headings were not counted.

## Fix Applied

None to the spec above (its assertion is not wrong, only open). The five specs this pass added for
the double report end their blocks with `"", ""`, so the blank line after the block is part of
what they pin.

## Proposed Standard

`CLAUDE.md` -> "Test Assertions": a `toContain` pinning a block of output ends with the line that
follows the block — the blank line, or the next line — never with the block's own last line. Not
in conflict with any NEVER/ALWAYS rule there; it narrows "the rendered frame is the contract".
