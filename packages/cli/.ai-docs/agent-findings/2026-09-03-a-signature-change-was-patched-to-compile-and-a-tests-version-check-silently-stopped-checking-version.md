---
type: missing-standard
severity: medium
affected_files:
  - e2e/lifecycle/preview-matches-install.e2e.test.ts
  - apps/editor/src/features/configure/lib/output-preview.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  Restored the `CORPUS_CLI_VERSION` import and added a second assertion in
  `e2e/lifecycle/preview-matches-install.e2e.test.ts` (the "stamp the version every compiled
  sub-agent on disk carries" spec) checking `Compiled by ${CORPUS_CLI_VERSION}.` against a real
  install's compiled bodies — the line the version now actually lives in — and reworded the
  surrounding comments to say so. Mutation-proved: a deliberately wrong literal (`Compiled by
  0.0.0-mutation-check.`) reddened the spec on exactly that assertion; reverting to
  `CORPUS_CLI_VERSION` returned it to green.
---

## What Was Wrong

`provenanceMarker` in `packages/compile/src/agent-source.ts` changed signature from
`provenanceMarker(version: string)` to `provenanceMarker()` — its bytes are now deliberately
constant across releases, and the version that used to live on that line was moved to a different
line entirely (the trailing `<system-reminder>` block, rendered by `agent.liquid` as `Compiled by
{{ generatorVersion }}.`).

The e2e spec that called the old signature, `preview-matches-install.e2e.test.ts`, was patched to
keep compiling: `provenanceMarker(CORPUS_CLI_VERSION)` became `provenanceMarker()`, and the
now-unused `CORPUS_CLI_VERSION` import was deleted alongside it. That patch was purely
type-driven — it makes the file compile again — and it silently deleted the only thing the test
was written to check. The test's own name ("stamp the version every compiled sub-agent on disk
carries") and its `expect` message ("does not carry the version the preview would stamp") both
still claimed a version check after the patch, while the code underneath had become:

```ts
expect(body, `${file} does not carry the version the preview would stamp`).toContain(
  provenanceMarker(),
);
```

`provenanceMarker()` is a compile-time constant, so this assertion could not fail for a version
reason no matter what `CORPUS_CLI_VERSION` held — a corpus vendored at any release, including a
stale one, satisfies it. The spec passed, its name and message kept asserting it verified version
parity between the editor's preview and a real CLI install, and nothing about that claim was true
any more. `git diff HEAD` for the file showed exactly this shape: an import deletion and an
argument drop, with no other line touched — the signature is what a compiler error reports, and
the mechanical fix for a compiler error is what left the check gutted.

Two entangled defects, not one:

1. **Structural** — the check stopped being an independent comparison and became a self-reference
   through a constant, indistinguishable in shape from mocking away the thing under test.
2. **Textual** — the test's name and `expect` message described a check ("version") the code no
   longer performed, which is the same failure mode CLAUDE.md already names for a mocked parse
   ("NEVER let a spec's NAME claim validation that its mocks have removed") — except there was no
   mock here, so that rule's literal trigger (`vi.mock`) did not fire and nothing caught it.

## Fix Applied

See `resolved_by` above. The provenance-marker check is kept, but reframed as a subject guard
("proves this CLI wrote the file, proves nothing about which release") rather than the version
check; a second assertion against the line that actually carries the version now does the check
the name promises.

## Proposed Standard

**When a shared function's signature changes and a call site is updated only to satisfy the
compiler, the diff must be read for behavior lost, not just for types restored — and where the
call site is a test, its name and failure message are part of that read.** A type error is a
necessary trigger for finding this class of drift and a wholly insufficient one for closing it:
`tsc` has no opinion on whether the two-argument call and the zero-argument call check the same
thing, only on whether the zero-argument call compiles.

Concretely, propose adding to `CLAUDE.md`'s "Test Assertions" section, immediately after the
existing mock rule (which this generalizes): _"NEVER let a test's NAME or `expect` message survive
an upstream signature change unexamined. When a function a test calls drops a parameter, gains a
default, or otherwise changes what it computes, re-read every test asserting on its result for
whether the CLAIM in the test's name and message still holds — not only whether the call still
compiles. The tell is the same shape as a mocked-away parse: a diff that touches only an import and
a call site, with no adjacent change to the assertion's expected value."_

No new checker is proposed. This class is not mechanically detectable in general — the compiler
cannot tell "this call site's meaning changed" from "this call site's meaning didn't" — so the rule
is a reading discipline rather than a lint rule, the same way the existing `vi.mock` rule is.
