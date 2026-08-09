---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/init-edit-error-guards.e2e.test.ts
  - src/cli/lib/loading/source-fetcher.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-08
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Owner ruling 2026-08-09 settled question 1: a `--source` path that does not exist is an argument
  error. `loadFromLocal` (source-loader.ts) now resolves the path through `fetchFromSource` — the
  same call `loadFromRemote` already made — so the load throws before `init`/`edit` mount a wizard,
  and `fetchFromLocalSource`'s message grew the house-voice tail (why it is invalid, what to do, a
  pointer at the public marketplace). Both specs are plain `it` and green. Question 2 (a non-TTY
  interactive command's Ink stack trace) is untouched and unclaimed by this ruling.
---

## What Was Wrong

`e2e/lifecycle/init-edit-error-guards.e2e.test.ts` has two specs whose names claim
the CLI reports an unusable `--source`:

- `init with invalid source flag should error gracefully`
- `edit with --source pointing to nonexistent path should error`

Both asserted exactly two things:

```ts
expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
expect(combined.length).toBeGreaterThan(0);
```

The second is satisfied by any output whatsoever. Replacing it with the message
`source-fetcher.ts` actually emits for this case —
`Local source not found: '<path>'` — turns both specs red, and the reason is not a
wording mismatch.

**`init --source /tmp/not-a-real-source-path-xyz` never mentions the path.**
Reproduced by hand outside the harness on 2026-08-08:

```
⠏ Loading skills...

  ERROR Raw mode is not supported on the current process.stdin, which Ink uses
       as input stream by default.
```

The run resolves the DEFAULT marketplace instead of refusing the flag, gets as far
as mounting the wizard, and dies there because the invoking shell is not a TTY. The
`edit` variant behaves the same way and additionally warns
`Installed skill 'web-framework-react' is missing from the marketplace` — a
downstream consequence of having silently loaded a different source than the one
the user named.

So the non-zero exit these specs accepted is **Ink's raw-mode crash**, not a source
guard. They pass on a machine where the guard does not exist, and they would keep
passing if it were deleted, because nothing about their assertions is about the
source at all. `combined.length > 0` was satisfied by a React stack trace.

Two separate questions fall out, and this finding settles neither:

1. **Should `--source` be validated before the wizard mounts?** A path the user
   typed and the CLI cannot read is an argument error; falling back to the default
   marketplace makes the flag look accepted and produces confusing downstream
   warnings about "missing" skills.
2. **Should a non-TTY `init`/`edit` fail with an argument error rather than an Ink
   stack trace?** The current output is a ~60-line reconciler trace, which is the
   opposite of the "gracefully" the spec name promises.

## Fix Applied

**Discovery first, then the guard (CLI-447, 2026-08-09).** The first pass gave both specs the
assertion their names claim (`Local source not found:` plus the offending path) and pinned them
`it.fails`, changing no product code, because which of the two behaviours above was intended was an
owner decision.

The owner ruled question 1: the flag hard-errors. `loadFromLocal` in
`src/cli/lib/loading/source-loader.ts` had been resolving the local path by hand
(`path.isAbsolute(source) ? source : path.resolve(cwd, source)`) and reading it, which returns an
empty matrix for a directory that does not exist. It now goes through `fetchFromSource`, which
already performed exactly that resolution AND the existence check — so the refusal costs no new
code path and the duplicated join is gone. The message reads:

```
Local source not found: '/tmp/not-a-real-source-path-xyz'

Nothing is at that path, and a local source must be a directory holding a skills marketplace.

Check it for a typo, or name a marketplace that exists:
  --source github:agents-inc/skills
```

Both specs are plain `it` and green, and `source-loader.test.ts`'s
"should return empty skills for non-existent skills directory" — which pinned the old silent
behaviour — was rewritten to the refusal.

**Deliberately unchanged:** a path that EXISTS but holds no skills still loads an empty matrix and
mounts the wizard. The ruling covers a path that does not exist; the sibling unit test
"should return empty skills if skills directory is missing" documents the other case as it stands.
Question 2 above (a non-TTY `init`/`edit` dying on Ink's raw-mode stack trace) is also untouched.

## Proposed Standard

For `.ai-docs/standards/e2e/anti-patterns.md`, under the existing weak-assertion
section:

**A spec asserting an error path must name the error.** `exitCode !== SUCCESS`
paired with `output.length > 0` is not an error assertion — it is an assertion that
the process produced bytes. Every crash satisfies it, including crashes from an
unrelated layer, which is exactly what happened here: two specs about `--source`
validation were green on an Ink terminal-capability failure for as long as they have
existed. The affordable form is the specific message plus the specific input that
provoked it, so the assertion cannot pass for a different failure of the same
command.

This generalises the doc's existing "Never assert generic absence" rule to its
positive twin: a generic PRESENCE assertion (`length > 0`, `toBeTruthy()`,
`toContain("error")`) is the same defect pointed the other way.

Second, narrower note for the same doc: **an interactive command driven through
`runCLI` (no PTY) can only ever be asserted on failures that happen BEFORE Ink
mounts.** Anything after that point is masked by the raw-mode crash. Specs about
interactive commands' argument handling belong on the PTY harness, or the
argument handling has to move ahead of the render.
