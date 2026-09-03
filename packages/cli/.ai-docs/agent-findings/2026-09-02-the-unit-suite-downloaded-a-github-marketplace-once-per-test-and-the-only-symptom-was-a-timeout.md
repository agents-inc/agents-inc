---
type: missing-standard
severity: high
affected_files:
  - src/cli/lib/__tests__/helpers/isolated-home.ts
  - src/cli/lib/__tests__/commands/doctor.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
  - src/cli/lib/__tests__/commands/doctor-content.test.ts
  - src/cli/lib/__tests__/commands/search.test.ts
  - vitest.global-setup.ts
  - vitest.setup.ts
standards_docs:
  - .ai-docs/reference/testing/factories.md
date: 2026-09-02
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The download is gone and the shared checkout is in place. **Two claims made here on 2026-09-02
  were measured false the same day and are corrected rather than left standing.** (1) "No test in
  any of the three vitest projects makes a network request" — one does. Instrumenting every
  `fetch` and `http/https.request` across 221 files and 7430 tests found exactly one request
  leaving the process, `https://registry.npmjs.org/agents-inc`, from oclif's detached
  update-check child, attributed to `commands/edit.test.ts` on 3 of 3 runs. Zero marketplace
  requests; the instrument was validated against a real `giget` download first. (2) The escape
  census is not two specs: 25 point a home and 22 hand-roll one exclusively — but that reach
  costs nothing measurable, and the one live escape is in a file that DOES use the helper, in a
  single describe that does not. **No in-process interceptor can ever see it**: the request comes
  from a different process, which is the second and harder reason a `globalThis.fetch` guard is
  the wrong shape. The remedy is an env pin in `vitest.setup.ts` rather than a gate — it makes
  the class unreachable instead of merely observable. Filed as CLI-870.
---

# The unit suite downloaded a GitHub marketplace once per test, and the only symptom was a timeout

CLI-853 was filed as a timeout: `eject.test.ts`, `doctor.test.ts` and `doctor-content.test.ts`
reddening with `Test timed out in 10000ms` under a full-graph `turbo` run, green in isolation,
intermittent. The row reasoned about budgets — whether a 10s allowance is honest for "a cold
spawned process", or whether the `commands` project should stop competing with other workspaces'
tasks.

Neither premise held. **These specs do not spawn anything** — `runCliCommand` in
`__tests__/helpers/cli-runner.ts` calls `run(args, { root: CLI_ROOT })` from `@oclif/core`
in-process. And the thing consuming the budget was not process start: it was a live download of
`github:agents-inc/skills` from `api.github.com`, followed by a gunzip and ~500 file writes,
**once per test**.

## The mechanism

`setupIsolatedHome` gives every test a fresh throwaway HOME. `cacheRoot()` in `consts.ts` is
`os.homedir()/.cache/<DEFAULT_PLUGIN_NAME>`, so a fresh HOME is a fresh EMPTY marketplace cache —
and `classifyCachedCopy` in `lib/loading/source-fetcher.ts` reads an absent cache as `unrecorded`
and re-fetches. Any command that falls through to `DEFAULT_SOURCE` therefore downloaded the whole
public catalogue again, from scratch, on every single invocation.

Measured 2026-09-02 by wrapping `globalThis.fetch` through `NODE_OPTIONS=--import`:

```
FETCH_LOG=<path> NODE_OPTIONS="--import=<counter>.mjs" \
  npx vitest run --project commands src/cli/lib/__tests__/commands/doctor.test.ts
```

64 requests to `api.github.com` for 23 tests — 21 tarball `GET`s and 42 `HEAD`s. `eject.test.ts`:
24 requests, 8 tarball `GET`s. The whole `commands` project made 31 tarball downloads per run.

**The network is the small half.** Mean HTTP latency was 212ms; the tarball `GET`s summed to 5.1s
of the file's 56s. The rest is decompression and filesystem work, which is CPU and IO bound — which
is exactly why the failure tracked machine load and not code. On an idle 20-core machine the
slowest test was 4546ms against a 10000ms budget; under 20 deliberately manufactured CPU burners
the same specs ran 9–23s and nine of them timed out.

## Why the count and the slowness matched exactly

One tarball download equals one slow test. Counted per file on an idle machine, tests over 1s
against tarball `GET`s: `doctor.test.ts` 21 and 21, `eject.test.ts` 8 and 8. Eleven of the fifteen
files calling `runCliCommand` had **no** test over 1s beyond their own first — that first one being
the cold dynamic import of `dist/commands/<x>.js`, which is a real and bounded per-file cost of
about 0.6–3.6s. So this was never a family-wide budget problem: four files reached the default
remote source and the rest built a local source directory, which is the pattern the majority of the
directory already followed.

## What made it invisible

Three things, and the third is the one worth keeping.

1. **The cost has no name at the call site.** `await runCliCommand(["doctor"])` says nothing about
   a network, and the command's own reachability check is legitimate product behaviour. The tests
   that paid for it assert nothing about the marketplace at all — they pay incidentally.

2. **The suite was green.** A network dependency in a unit project produces no failure, only a
   variance; it becomes a failure when someone else's build is running, which reads as flake.

3. **It had already been met, and answered with a longer fuse.** The tree carried
   `const COMMAND_TIMEOUT = 30_000` over eight specs in `search.test.ts`, and a lone
   `{ timeout: 30_000 }` on the first spec in `doctor.test.ts`. Both are this defect, patched in
   whichever specs had lost that day's race. Neither author had a reason to look further, because
   a timeout that stops firing looks fixed. **Both have been deleted as part of the repair, and
   that deletion is the falsifiable half of it** — if the diagnosis were wrong, those nine specs
   are the first to redden.

## The standard that did not exist

The e2e suite solved this exact problem and wrote down why:
`e2e/fixtures/default-source-cache.ts` seeds the default-source cache and states that it is
"offline by construction, twice over", including the detail that a seeded copy with no fetch record
"reads as `unrecorded` and is re-downloaded — the exact failure this fixture exists to avoid". That
knowledge existed, in this package, for months. What did not exist is any rule saying a UNIT
project must not reach the network, or any equivalent seeding on the unit side — so the second
suite rediscovered the problem from the symptom end.

`src/cli/lib/__tests__/helpers/shared-source.ts` is the other half of the precedent and is a closer
structural match: one fixture built once in `globalSetup` at a fixed `os.tmpdir()` path, shared by
every worker, "~1.65s once instead of 51 times". The fix here is that shape applied one directory
over, to the marketplace checkout rather than the source tree.

## What was done

`src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts`. One checkout, fetched once per
machine from `vitest.global-setup.ts` — the only point in a run where no worker is racing it —
published by `rename` so a killed run cannot leave a half-built tree that detection would accept,
and recorded with a `tar` and no `etag` so `classifyCachedCopy` answers `current` without asking
the network anything. Each fake home's `.cache` is a symlink to it, at `.cache` rather than one
level deeper so giget's own tarball cache is shared by the same link; `fs.rm` unlinks a symlink
rather than descending, so a fake home's teardown leaves the checkout standing.

Sharing costs no isolation: what these tests isolate is `~/.claude/`, and the checkout is a
read-only, content-addressed copy of a public repository that no subject writes to and no spec
asserts on.

Measured, unfiltered `commands` project, idle machine: sum of test durations 130,447ms → 44,519ms,
slowest test 4546ms → 1574ms, GitHub requests 31 → 0. Under 20-way manufactured contention, 2/2
runs red before (1 and 9 timeouts) and 3/3 green after, with the slowest test falling from 22,317ms
to 4837ms and the count of tests over 8s from 29 to 0.

## What would catch a regression, and what would not

The `commands` project's own timings would drift back, and nothing would say so. There is no
mechanical check that a test has made a network request, and the honest note for whoever builds one
is that it is not a two-line `globalThis.fetch` refusal: `useMockWorker` installs `msw/node`, which
intercepts `fetch` for handled routes, so a naive guard has to distinguish a request MSW answered
from one that reached a socket. **A second sentence here was already false when written**: the
`commands` project does have MSW — five of its specs install `useMockWorker`, and
`helpers/mock-worker.ts` was committed in `7190211d`. And the harder problem is not
discrimination at all: the one real escape is made by a DIFFERENT PROCESS, so no in-process
interceptor is complete no matter how carefully it is written.

The two rows in `.ai-docs/reference/testing/factories.md` naming the new exports ARE mechanically
checked — `scripts/check-enumeration-drift.ts` reads the `helpers/` directory and failed the run
until they were added, which is how they got there.
