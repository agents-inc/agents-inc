---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/__tests__/helpers/isolated-home.ts
  - src/cli/lib/configuration/config.test.ts
  - src/cli/lib/loading/source-loader.test.ts
  - .ai-docs/agent-findings/2026-08-16-a-test-comment-asserted-os-homedir-ignores-HOME.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-19
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: open
---

# Two documents give opposite answers about `os.homedir()`, and both are right on one runtime

## What Was Wrong

Isolating `HOME` in a unit spec has two mechanisms, and the tree carries two flatly contradictory
statements about whether they are interchangeable.

`src/cli/lib/__tests__/helpers/isolated-home.ts`, in the JSDoc every author of a command spec
reads first:

> They do NOT isolate code that calls `os.homedir()` — that path reads the OS-level home and
> ignores `process.env.HOME`, so it requires a `vi.spyOn(os, "homedir")` spy instead […] The two
> mechanisms are NOT interchangeable.

A finding written ten weeks later corrected a test comment making the same claim, on the grounds
that it is false, and demonstrated it with a one-liner:

> `os.homedir()` does not ignore `process.env.HOME`. Node's POSIX implementation returns `$HOME`
> when it is defined […] Verified directly.

**Both measurements are correct. Neither is complete.** This package runs its tests under node and
under bun — `CLAUDE.md`'s pre-commit checklist names `npm test`, `cli-runner.ts`'s own JSDoc exists
because "bun's `console.log` does not go through `process.stdout.write`", and the dist-staleness
guard's message names `bun run build`. The two runtimes disagree:

```
$ node -e 'process.env.HOME="/tmp/probe"; console.log(require("os").homedir())'
/tmp/probe
$ bun  -e 'process.env.HOME="/tmp/probe"; console.log(require("os").homedir())'
/home/<user>
```

Node re-reads `$HOME` on every call. **Bun resolves it once at startup and ignores later mutation**,
so a spec whose only isolation is `process.env.HOME` reads the developer's real home under bun and
the fake one under node — the same spec, two answers, and green under whichever runtime it was last
run on.

The cost is not the two files disagreeing. It is that each one, read alone, settles the question:
an author who lands on the finding writes `stubEnv` and stops, and an author who lands on the JSDoc
writes a spy and stops. The correct construction is both, and neither document asks for it. The
already-shipped exemplars use both — `build:marketplace`'s catalog spec pairs `setupIsolatedHome`
with `vi.spyOn(os, "homedir")`, and `edit.test.ts` does the same — but each carries a
reason-for-this-spec comment rather than a rule, so they read as local workarounds.

## Fix Applied

Partial, and in the two places the ambiguity was live:

- The 2026-08-16 finding now carries the bun measurement beside the node one, and its
  `resolved_by:` says which runtime each half is true of, so it can no longer be read as settling
  the question in one direction.
- `config.test.ts`'s `resolveBranding` block and `source-loader.test.ts` both use the env var AND
  the spy, each with a comment naming the two-runtime reason rather than a spec-local one. The rule
  is written into `.ai-docs/standards/e2e/test-data.md` § _An in-process command spec owns its
  `HOME`, not just its `cwd`_.

Not fixed: `isolated-home.ts`'s JSDoc still states the node behaviour as false without qualifying
it by runtime. Correcting it is a one-paragraph edit, but the paragraph is the file's central claim
and several specs cite it, so it is recorded here rather than rewritten inside a task scoped to
assertions.

## Proposed Standard

Extend the rule the 2026-08-16 finding proposed for
`.ai-docs/standards/clean-code-standards.md` § comments. Its current form — "a comment that states
a fact about a runtime is an assertion, and it is checkable; run the one-liner that shows it" — is
what produced this: the one-liner WAS run, on one runtime, and the result was written down as a
property of the language.

> **Run it on every runtime the code runs on, and say which one you ran.** A claim about a
> platform API in a package that executes under more than one engine is not settled by one
> measurement. Write the runtime into the sentence — "node re-reads `$HOME`; bun fixes it at
> startup" — so the next reader can see whether their case was covered rather than assuming it
> was. A claim with no runtime named reads as universal, and a universal claim is the one nobody
> re-derives.

This is the same shape as `standards/e2e/assertions.md`'s rule that a class check must NAME the
trees it read, arriving from the runtime axis instead of the directory axis. Worth cross-linking
the two so neither reads as a one-off.
