---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/e2e/specs/persistence.spec.ts
date: 2026-08-08
reporting_agent: web-developer
category: testing
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  EDITOR-26 (2026-08-08). `merge` returns `current` when `persisted` is
  `undefined` — zustand's "nothing was stored" — so the warning below now fires
  only for data that genuinely failed to parse. Pinned by a red-first Playwright
  test in `persistence.spec.ts` that watches the console across a load with an
  empty storage and asserts nothing is reported. The full 186-test run is clean
  of it; before the fix it emitted one per page load.
---

## What Was Wrong

Playwright's web server printed this on nearly every test, and had for as long
as the log has been read:

```
[vite] (client) [console.warn] [issue] Discarded unreadable saved configuration
  {"persistVersion":8,"issues":["(root): invalid_type"]}
```

It is not a stale fixture and not a migration dropping user data. It is the
store calling an empty storage a corrupt one.

`config-store.ts` ends its `persist` options with a `merge` described as "the one
untrusted boundary: anything unparseable is discarded in favour of empty state
rather than crashing the app". It parses what it is handed, and reports a
discard when the parse fails. What it never accounts for is that zustand hands
it `undefined` when there is nothing to parse. The hydrate path in
`zustand@5.0.14`'s `middleware.mjs`, condensed to the two branches that matter:

```js
return toThenable(storage.getItem.bind(storage))(options.name).then((v) => {
  if (v) { /* … version check, migrate … */ }
  return [false, void 0]              // nothing stored
}).then(([migrated, migratedState]) => {
  stateFromStorage = options.merge(migratedState, get() ?? configResult)
```

`merge` runs after **every** load, including the ones that read an empty
storage. `persistedConfigSchema.safeParse(undefined)` fails at the root with
`invalid_type`, which is the issue code in the message verbatim.

Measured rather than reasoned: a Playwright script with a fresh context reported
`storage at boot: {"raw":null,"keys":[]}` alongside exactly one warning, and
`localStorage` was still `null` after mount — the store writes nothing until
something changes. One spec file of four tests produced exactly four warnings.
The e2e fixture's own comment says why it is every test: "Every spec gets its
own browser context, so localStorage starts empty".

So the message was wrong in production too, and in the direction that matters
most. Every first-time visitor to the editor takes this path. In development the
sink is the console; in production it is whatever `setReportingSink` installs —
so the app files an issue claiming an afternoon of configuration was thrown
away, against people who had never saved anything. The one branch the code calls
"the app's only _silent_ failure" was its loudest and least true.

The second path into the same call is real and was hidden by the first:
`migrateConfig` returns `undefined` for any version that is not the current one,
so a version bump also arrives as `undefined` and was also reported as
"unreadable". It was readable; it was obsolete. Two different events, one
message, and the common one was not an event at all.

Nothing caught it because nothing looks. 186 Playwright tests drive every
surface of this app and not one of them asserts anything about what the app
reports. A warning printed on every single page load sat in the web server's
stderr, visible in every run, and the suite stayed green — which is the same
shape of gap as an unchecked `console.error`: the log is evidence nobody
subscribed to.

## Fix Applied

One guard, at the cause:

```ts
merge: (persisted, current) => {
  if (persisted === undefined) return current
  const parsed = persistedConfigSchema.safeParse(persisted)
  …
```

with the reasoning beside it. The warning now fires for exactly what it claims:
JSON that parsed and then failed the schema. The malformed-JSON case is
untouched and still lands elsewhere — `createJSONStorage` throws inside
`getItem`, so `merge` never runs for it, which is why "unreadable storage falls
back to an empty configuration" passed both before and after.

Red first: the new test in `persistence.spec.ts` failed naming the exact string,
and the full suite now runs clean of it.

One deliberate consequence, recorded rather than fixed: the version-bump discard
is now silent too. It was reported under the wrong name, and reporting it under
the right one belongs in `migrateConfig`, which is the only place that knows the
version it is refusing. That is a new report rather than a repair, so it was not
written here.

## Proposed Standard

> **A test suite that ignores the console is not watching the application it is
> driving.** If the app has a reporting seam, at least one E2E test must assert
> that an ordinary path reports nothing through it — the boring load, the
> successful save. Everything else the suite does is an assertion about what the
> app _shows_; this is the only one about what it _says_.

The cheap version is what landed: attach `page.on("console", …)` before the
navigation being watched, collect what matches the seam's prefix, assert the
array is empty. It is six lines and it caught a warning that had survived every
run of the suite to date.

Where it should live: `apps/editor/e2e/README.md`, under "Conventions", beside
"Assert on the accessibility tree" — both are rules about asserting on a channel
the test author would not otherwise think to look at.
