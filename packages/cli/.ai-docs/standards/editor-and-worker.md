---
last_validated: 2026-08-19
---

# The Editor, the Worker, and the Contracts Between Them

> Rules for `apps/editor`, `apps/server`, and the packages the two of them share
> (`packages/matrix` above all). Consult it when a change crosses that boundary — a schema
> published by one workspace and read by another, a response header, or a browser-persisted store.

**Every defect this page exists to prevent was green in both workspaces.** That is the property
they share and the reason they need a page rather than a review comment. `apps/server`'s suite
reaches its routes through `SELF.fetch` and `hc<AppType>`; the editor's unit tests reach the same
routes through MSW in Node; `packages/matrix` type-checks the schema both ends import. None of
those is a browser, and none of them is a second machine. So the type system agrees, both suites
agree, and only a real user disagrees — in production. Where a rule below names a check, the check
is the only mechanism that has ever caught its class.

---

## A published contract carries what its consumers need in order to REFUSE an entry

**Where one component publishes a catalogue of things and another applies a hard limit to them, the
limit's input belongs in the published contract.** A refusal that can only be computed after the
consumer does its own fetch arrives at the end of the funnel by construction, and the funnel is the
part the user pays for.

`skillIndexEntrySchema` in `packages/matrix/src/skill-index.ts` once declared five fields —
`name`, `description`, `repo`, `path`, `stars` — and no size of any kind, while
`MAX_EXTERNAL_SKILL_BYTES` in `packages/matrix/src/seed.ts` refused any skill past it. Nothing
downstream could mark a search row as unaddable, because nothing downstream knew how big the row
was. A visitor spent search, stage, categorise, confirm and a full tree listing on a row that was
never addable, and the index that offered it had been in a position to say so. The schema now
carries a required `bytes`, `apps/server/src/crawl.ts` sums the blob sizes under each skill
directory from the tree it already fetches, and the refusal (`isPastCarryLimit`, `carryLimitRefusal`
in `apps/editor/src/lib/api/skill-contents.ts`) is shared by the search row and the late check so
the two cannot phrase it differently.

**Neither document was wrong on its own terms, which is what makes this drift rather than an
omission.** The index was specified as "enough to show a result, and enough to fetch it afterwards";
the cap was specified in the payload schema, where it is enforced correctly. No rule required the
two specifications to meet. That is the rule.

**The mechanical signature: two modules narrowing the SAME upstream endpoint with two different
local schemas.** `crawl.ts` and `skill-contents.ts` both declare a private `treeSchema` over
GitHub's `GET /repos/{repo}/git/trees/{ref}?recursive=1`. One kept `size` and answered the cap
before downloading a byte; the other mapped the response to `entry.path` and dropped the rest. A
reviewer who noticed the pair would have asked why, which is the whole finding.

```
grep -rn 'treeSchema' apps/server/src apps/editor/src --include='*.ts'
```

Two declarations. When this returns more than one declaration of a schema over one endpoint, diff
the field sets before assuming the difference is deliberate — and where it is deliberate, say so at
both sites.

**A shape change to a published index is handled by bumping the KV key, not by weakening the
schema.** The index already in KV was built by the previous crawl, so a newly required field makes
`skillIndexSchema.safeParse` reject the live document and the editor reports the index as unreadable
until the daily Action republishes. `skill-index.ts` records the bump as the documented answer;
making the field optional to dodge the ordering hazard buys a permanently optional field for one
deploy's worth of convenience.

---

## No route path may end in `/index`, and a route the editor reaches through `hc` owes an `hc` test

**Hono's RPC client deletes a trailing `/index` segment from the URL it builds.** It is a deliberate
convention — `client.foo.index.$get()` is how you address the route at `/foo` — and its price is that
a real route whose path ends in `/index` is unreachable from the generated client while `curl`
reaches it normally. `removeIndexString` in `hono/dist/client/utils.js` is the whole mechanism
(hono 4.12.33):

<!-- Quoted verbatim from hono's published build, which this package's prettier does not own. -->
<!-- prettier-ignore -->
```js
var removeIndexString = (urlString) => {
  if (/^https?:\/\/[^\/]+?\/index(?=\?|$)/.test(urlString)) {
    return urlString.replace(/\/index(?=\?|$)/, "/");
  }
  return urlString.replace(/\/index(?=\?|$)/, "");
};
```

**Nothing reports it.** The route is registered, the worker serves it, `AppType` carries it, the
emitted declaration types it, and `client.skills.index.$get()` even **compiles** — because the
type-level path and the runtime path are computed by different code. Only a request shows the
mismatch, and only from the client half. The constraint travels between two workspaces with nothing
in either one stating it: `apps/server` names `hono/cors` and `@hono/zod-openapi`, and `hc` lives in
`apps/editor`.

```
grep -n 'path: "[^"]*/index"' apps/server/src/index.ts
```

Nothing today. The worker's routes — re-derive them with `grep -n 'app.openapi\|app.on(' apps/server/src/index.ts` rather than trusting a count here; they grew on 2026-08-29 and any list here would be the third one to rot. What is worth stating instead is the SHAPE: every route but one is in the single `.openapi()` chain, and the exception is Better Auth's `/api/auth/*`, mounted with `app.on` because describing somebody else's paths in `createRoute` would be transcribing their contract.
`/skills` is the near miss this rule is for: it was written as `/skills/index` first, and by the
mechanism above `client.skills.index.$get()` would have requested `/skills` and 404ed while every
`SELF.fetch` in the suite kept passing.

**Which routes owe an `hc<AppType>` test is decided by how the editor reaches them, not by
membership of the chain.** `SELF.fetch` and `hc` compute their URLs by different code, so a suite
that only uses `SELF.fetch` is exercising a path the editor never requests.

```
grep -rn 'hc<AppType>' apps/server/src apps/editor/src
```

Read the two sides as a pair. The editor holds exactly two clients —
`apps/editor/src/lib/api/configs.ts` and `apps/editor/src/lib/api/skill-index.ts` — covering three of
the four routes, and `apps/server` answers with a block for each: `the typed client the editor uses`
in `src/index.test.ts`, and `is reachable through the typed client the editor uses` in
`src/skill-index.test.ts`. `/monitoring` is the fourth and is deliberately not on the client's
surface: Sentry's SDK is handed a literal URL through its `tunnel` option
(`apps/editor/src/lib/observability/sentry.ts`), so nothing computes that path and nothing can strip
a segment off it. **A route reached only by a literal URL is exempt from the test and not from the
`/index` ban** — the caller can change, and the ban is what makes changing it free.

§ _A response header the editor reads must be named in `exposeHeaders`_ closes with the general
clause both halves of this are instances of.

---

## A response header the editor reads must be named in `exposeHeaders`

**A custom response header is not visible to a cross-origin caller unless the server also names it
in `Access-Control-Expose-Headers`.** `hono/cors` defaults `exposeHeaders` to `[]` and emits the
header only when that array is non-empty, so a header the worker sets is sent, received, and
dropped by the browser with no error anywhere. `response.headers.get(...)` returns `null` and the
consumer treats it as an absent value rather than a hidden one.

`GET /skills` answers with `x-skill-index: fresh | stale`, named once as
`SKILL_INDEX_FRESHNESS_HEADER` in `packages/matrix/src/skill-index.ts` precisely because a header
three parties agree about is a contract like any other. The worker set it and the editor could not
read it, for as long as `cors()` was registered with an origin and nothing else.

<!-- prettier-ignore -->
```ts
cors({ origin: ..., exposeHeaders: [SKILL_INDEX_FRESHNESS_HEADER] })
```

Every custom header constant must appear at **two** sites in `apps/server/src/index.ts` — the
response it is set on, and the `exposeHeaders` array. Read the pair rather than either half:

```
grep -rn '_HEADER' apps/server/src packages/matrix/src --include='*.ts' | grep -v '\.test\.'
```

**Only one mechanism in the repository can catch this, and it is neither workspace's obvious one.**
`SELF.fetch`, `hc<AppType>` and MSW all read the header regardless of the CORS config, so every
test in both workspaces stays green. The guard is a single case in `apps/server/src/skill-index.test.ts`
— `lets a browser read the freshness header it sets` — which observes the worker's own CORS
configuration; the editor's Playwright stubs use `route.fulfill`, which answers **in place of** the
worker and therefore cannot see its configuration no matter what it asserts. The editor's own guard
is the mirror image and is worth keeping for a different reason: `stubSkillIndexHidingFreshness`
reproduces a response with the header withheld, which a stripping proxy still produces with the
worker configured correctly.

**Design the consumer for three answers, not two.** `freshnessOf` returns
`fresh | stale | unknown`, and only `stale` is a statement the dialog repeats to a user. Folding
`unknown` into `stale` — the obvious first implementation — puts a permanent, false "index still
filling" caveat under every complete list for as long as any transport hides the header.

**The general clause, and the reason this section is not just about one header: the editor's
transport imposes constraints on the worker that neither workspace's type system nor test suite can
see.** Two have been found the hard way — a trailing `/index` path segment Hono's RPC client
deletes, making that route unreachable from the editor, and a header the browser hides. A third will
not announce itself either. When a change adds a route, a header, or a response shape the editor
consumes, ask what the browser and the RPC client do to it, because nothing in either workspace will.

---

## A route that fans out to N upstream calls must bound N by construction

**A Cloudflare Worker may issue 50 subrequests while handling one request on the Workers Free plan**
(1000 on Paid), and may hold six simultaneous outbound connections. **Nothing local models either
limit.** Miniflare does not — `subrequest` appears nowhere in the pool or in miniflare's dist.
`wrangler dev` does not: a route that fans out sixty times against real GitHub fills its index there
perfectly happily. The suites do not, because they stub `fetch`. So a worker that exceeds either
limit is green in every environment a developer has and fails only at the edge, which is why this is
a written rule rather than something a review would notice.

The rule: **a route that fans out to N upstream calls bounds N by construction, and the bound is a
named constant carrying the platform limit in its comment.** A fan-out bounded only by how big the
upstream happens to be today is untested code with a live fuse. Where the bound cannot cover the
work, split the work across requests and say so in the response — never truncate silently, because
half an answer claims the missing half does not exist.

**The stronger move, and the one this repository took, is to get the fan-out off the request path
entirely.** The subrequest ceiling is a property of _handling a request_, so a job that does not
handle one has no ceiling and no six-connection limit either. `apps/server/src/crawl.ts` is the
worked example: it names no KV, no `Env` and no Hono, and `.github/workflows/build-skill-index.yml`
runs it through `apps/server/scripts/build-skill-index.ts` on a schedule, publishing the result to
KV. `readSkillIndex` in `apps/server/src/skill-index.ts` is one KV read, so `GET /skills` has no
upstream in it at all.

```
grep -rn 'fetch(' apps/server/src --include='*.ts' | grep -v '\.test\.'
```

Three sites, and only one is on the request path: `tunnelEnvelope` in `apps/server/src/index.ts`
relays exactly one envelope per request. The other two are in `crawl.ts`, which no route imports —
`scripts/build-skill-index.ts` is its only importer, which is the property that makes the crawl safe
rather than the constants inside it. A fourth hit inside a route handler is what this rule is for.

**`CONCURRENT_READS` in `crawl.ts` is not the six-connection limit surviving in another form**, and
its comment says so: it is courtesy to a host serving us a hundred files for free. Reading it as
platform enforcement would leave a future route believing something already guards it.

---

## A workspace is consumed as source only where the consumer already has its ambient globals

Every workspace here is consumed as source but one. `packages/matrix` and `packages/ui` point their
`exports` maps straight at `./src/*.ts`, and `apps/editor/tsconfig.app.json` resolves both through
`paths` aliases into those sources.

**The reason that works is not that the sources name nothing ambient.** `packages/ui` names DOM
globals freely — `KeyboardEvent<HTMLDivElement>`, `querySelectorAll<HTMLElement>` — and is consumed
as source correctly, because `@workspace/typescript-config/react-library.json` gives it the same
`lib` the consumer has. Same runtime, same ambient names, nothing to reconcile. The rule is about the
**difference**: a workspace may be consumed as source only where every ambient name its source uses
is one the consumer already declares.

`apps/server` is the exception, and the whole reason the rule is written down. Its source names
`Env`, the global `wrangler types` writes into `worker-configuration.d.ts`. **`import type` does not
cut the module graph** — TypeScript still pulls the named module into the consumer's program — so an
editor reading `src/index.ts` directly reports `TS2304: Cannot find name 'Env'` against the worker's
own entry.

**The trap worth recording is the fix that appears to work.** Adding `worker-configuration.d.ts` to
the editor's `include` makes the name resolve and produces exactly one error — `TS2345`, in
`apps/editor/src/features/configure/lib/use-pinned.ts`, about an effect callback whose return type no
longer satisfies `EffectCallback`. That file has nothing to do with the API. The Workers runtime
declaration redefines DOM globals, and Cloudflare's `Element` — HTMLRewriter's — displaced the DOM's.
One error is the visible tip: the whole browser app was compiling against a different meaning of
shared global names, and `skipLibCheck` is no defence, because these are not errors _inside_ the
`.d.ts`. A version of this that happened to produce **zero** errors would have merged with nobody
knowing the editor's DOM types had moved.

So: **a workspace whose source names ambient globals from a runtime the consumer does not run
publishes an emitted declaration, and points its `exports` `types` condition at it.** Only a
declaration boundary cuts the graph. The live shape is three files:

| File                              | What it carries                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/server/tsconfig.build.json` | `emitDeclarationOnly`, `rootDir: src`, and an `include` naming the entry alone                  |
| `apps/server/package.json`        | a `build` script, and an `exports` map whose `types` points at `dist/` while `default` does not |
| `turbo.json`                      | `^build` on `lint` and `typecheck`, not only on `test`                                          |

The emitted declaration still _mentions_ `Env`, as an unresolved name inside a `.d.ts`, which
`skipLibCheck` legitimately drops to `any`. That is harmless rather than lucky: Hono's `Client<T>`
reads only the schema generic and never the environment one, so the binding the editor cannot see is
also the one it has no use for.

**"Does it compile" is not the check.** After wiring a cross-workspace type import, confirm the
consumer's error count is unchanged **and** that no error appeared in a file unrelated to the import.
An unrelated file failing is this class's signature, not a coincidence.

**A generated type is a build output**, so every turbo task that resolves one needs `^build`. Without
it a cold checkout type-checks against a declaration that has not been generated yet and reports a
missing module rather than an unbuilt dependency.

```
grep -l '"types"' apps/*/package.json packages/*/package.json
```

One hit. A second is a second workspace crossing a runtime boundary, and it owes the whole shape
above — the consumer's side included: `apps/editor/tsconfig.app.json` aliases `@workspace/ui` and
`@workspace/matrix` back to their sources and deliberately does not alias `server`, which is what
leaves the declaration as the only route in.

---

## A `persist` store whose `merge` reads async reference data does not hydrate at import

**A Zustand store persisted with the `persist` middleware hydrates at module import.** If its
`merge` validates the restored blob against reference data that arrives **asynchronously**, the
validation always runs against whatever that data happened to be at import — never against what the
blob was written against.

`config-store`'s `merge` calls `pruneUnknownIds`, which drops every skill, agent and stack id the
**loaded catalogue** does not carry. At import the loaded catalogue is always the vendored public
one, because the marketplace catalogue is a `fetch` that cannot have resolved yet. So a
configuration built on a marketplace was pruned to nothing every time it was read back — on reload,
and again through the `?fromId=` import path, which prunes through the same function.

The rule:

> Set `skipHydration: true` on the persist options and export **one** named function that reads
> storage. Call it from the single place that knows the reference data has settled, and make it
> idempotent via `persist.hasHydrated()`.

`apps/editor/src/stores/config-store.ts` is the worked example: `skipHydration: true` on the
options, `readSavedConfig()` beside it as the only call that reads storage, and
`useCatalogFirst` (`apps/editor/src/features/configure/lib/use-catalog-first.ts`) as the single
sequencing point that seats the catalogue and only then calls it.

Three properties made this hard to see, and each is a rule of its own:

1. **`persist`'s `hydrate()` does not write back**, because it uses the raw `set` rather than the
   persisting one. A bad hydration corrupts memory now and storage on the next `set` — the user's
   next click. Reason about it as destructive **on a delay**, not as immediately destructive; the
   delay is exactly long enough to look like it did not happen.
2. **A console line is not a screen.** `reportPruning` logged `Pruned saved ids the catalog no
longer knows {droppedIds: 6}` on every occurrence. The defect was reported the whole time and
   nobody using the app saw it.
3. **The idempotence is not decoration.** Without it, leaving the screen and returning re-runs
   hydration and drops the selections `partialize` deliberately never wrote, then re-fetches a
   400 KB catalogue to arrive where the app already was.

**Where the same pure validator is reachable from more than one entry point, the ordering belongs at
a single sequencing point above them, not at each entry.** Reload and share-link import are
different code paths meeting at one function; a shim per door leaves two orderings that must agree,
and two orderings that must agree eventually will not.

The population, and the reason the rule is written before the second store needs it:

```
for f in $(grep -rl 'persist(' apps/editor/src --include='*.ts' --include='*.tsx'); do
  grep -q 'skipHydration' "$f" || echo "$f"
done
```

Three stores today, and the grep is a worklist rather than a verdict — `skipHydration` is only owed
where the `merge` reads something fetched. `ui-store`'s `merge` is a `safeParse` against a local
schema and `marketplace-store`'s is `readSavedMarketplaces(persisted)`; neither touches a catalogue,
so both are correct as they stand. `saved-stack-store` is the one to read. Its own `merge` is also a
pure `seedPayloadSchema` parse — the catalogue-dependent step is `adoptSeedPayload`, downstream at
the apply site (`use-apply-stack-request.ts`), which runs on a user action rather than at boot. That
ordering is the only reason the hazard is latent there, and it is exactly what the next person to
make the saved stack boot-applied would remove without noticing.

---

## Under `persist`, `set` IS the write — an action that changes nothing must not call it

Zustand's `persist` writes to storage on **every** `set`. So an action shaped "recompute the state
and store the result" writes even when the result equals what was already there. That is a fact about
writes, not a performance question, and treating it as one is what leaves the early returns below
reading as unrelated micro-optimisations.

The sequence where it stops being harmless is ordinary in this editor:

1. A configuration is saved against a marketplace that later stops loading — an expired PAT.
2. The opening **parks** the restore rather than reading the saved ids against a catalogue that has
   never heard of them. Nothing has been read; under `skipHydration` the store is empty by
   construction.
3. The visitor supplies the token and presses Load. The press seats the catalogue, and seating a
   catalogue prunes.
4. The prune writes an empty configuration over the slot — and only **then** does the parked
   `onSeated` run `readSavedConfig()`, which reads back the emptiness the press just wrote.

The recovery destroys the configuration it exists to recover.

**The guard belongs in the action, not at either door**, which is what makes it cover callers that
have not been written yet — the marketplace dialog and the switcher reach this through the same
action. `pruneToCatalog` in `apps/editor/src/stores/config-store.ts`:

<!-- The three statements of `pruneToCatalog`, its interleaved comment elided. apps/editor source,
     so the root config formats it without semicolons and this package's would add them. -->
<!-- prettier-ignore -->
```ts
const pruned = pruneUnknownIds(get())
if (!droppedAnything(get(), pruned)) return
set(pruned)
```

`droppedAnything` is shared with `reportPruning`, which already asked the same question to decide
whether to report. One question asked in two shapes is two answers waiting to disagree.

**Assert state identity, not storage.** `expect(useConfigStore.getState()).toBe(before)` is the
assertion in `config-store.test.ts`, and identity is the fact underneath: this action's only route to
`set` passes a freshly built object, so an unchanged identity means `set` was never reached — and
`set` not reached is the write not reached, whatever storage happens to be attached. It also runs in
the node environment that suite uses, where there is no `localStorage` to watch.

The population is every action that computes its next state from the current one rather than from its
arguments:

```
grep -rn 'set((state)\|get()' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

For each hit, ask whether the computation can return an equal value; if it can, the early return is
owed. Assignments straight from an argument — `set({ current: marketplace })` — are not in the
population. `pruneToCatalog` above is the worked example, and `addExternal` and `removeExternal` in
`catalog-store.ts` are the same shape for a different reason: **`catalog-store` is not persisted**, so
what their returns save is a re-seat of the read model rather than a write. A rule read off that store
alone would carry the shape and miss the reason.

**Two hits survive a deliberate reading rather than an oversight, and each is a different answer to
the question** — which is why they are recorded here instead of being left to be re-derived:

| Hit                                  | Can it return an equal value?                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setAgentOption` (`config-store.ts`) | Possible in the type, unreachable in fact — all three callers are `roster-panel.tsx` and each passes `nextInCycle(...)`, whose cycles are 4, 5 and 2 long, so the value always moves |
| `remember` (`marketplace-store.ts`)  | Reachable — a second successful load of the same marketplace on the same token — and harmless, because the store carries no `skipHydration`, so slot and memory never disagree       |

The second is the more useful entry: an equal value being reachable is not on its own the argument
for an early return. What made `pruneToCatalog`'s return load-bearing is the window `skipHydration`
opens, where the slot holds a configuration memory does not — and `marketplace-store` hydrates at
import, so a redundant write there rewrites what is already under it. If that store ever takes
`skipHydration`, `remember` owes the guard the same day.

**The return has to happen before `set` is called, not inside its updater.** `persist` wraps the
store's `set` as "call it, then write", and the `setItem()` half runs unconditionally — outside
zustand's own `Object.is` short-circuit — so `set((state) => ({}))` writes, and so does
`set((state) => state)`. An updater arm returning an empty partial reads as a no-op and is not one.

```
grep -rn 'return {}' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

**Nothing.** The three that existed — `toggleSkill`'s unknown-id arm, and the arms in `configure`
and `patchAssignment` beside it — are gone: the two helpers answer `undefined` for "the catalogue
turned this down" so their callers can skip `set` entirely, and `toggleSkill` guards ahead of the
updater. Run it with the `.test.` filter; without it the one hit is the paragraph in
`config-store.test.ts` that names the shape, and a comment pinning a class reads in the raw output
exactly like an instance of it.

**The corollary, narrower and easier to check: nothing may write the config slot between a parked
restore and the read that finishes it.** In that window the slot holds the only copy of the visitor's
configuration and memory holds none of it. `skipHydration` and `detachSavedConfig` defend it against
reads and against shared addresses; neither covers a write arriving from the visitor's own address
while a restore is parked.

---

## A persisted store has no vocabulary for state that is not this browser's

Because every `set` writes, the slot is an implicit output of **every action the store owns**, and
there is no way to say "this state is not mine to save" other than calling no action — which is not
something a UI can promise. The middleware offers `skipHydration` for "do not read yet" and nothing
at all for the write side.

The editor had exactly that shape and it was live: `?fromId=<id>` imported a shared configuration by
calling an ordinary store action, so the sharer's selection was written into the visitor's own slot
on arrival.

Three things made it hard to see, and each is worth keeping:

1. **The overwrite reads as the feature working.** After the import the screen correctly shows the
   shared configuration, and a reload shows it again — so it looks like the link survived a refresh.
   It did not: the URL had already been stripped, and what came back was the sharer's configuration
   read out of the _visitor's own slot_, which it had replaced. Right answer, destroyed data.
2. **Guarding the import is not enough.** Suppress the write at the import alone and the guarantee is
   one click deep: the visitor's first toggle on the shared view goes through an ordinary action,
   which persists whatever is in memory, which by then is the sharer's configuration plus one edit. A
   rule every action has to keep is a rule the next action added will break.
3. **It compounds with the read side.** Once the visitor's own slot holds ids from someone else's
   marketplace, the next ordinary load prunes them against the visitor's own catalogue and writes the
   empty result back — the hydration section above, seen from the other end.

The rule:

> Before putting state into a persisted store that did not come from this browser — a shared link, an
> impersonation, a preview, anything a URL can address — decide where its writes go, and enforce that
> by **swapping the storage**, not by guarding the actions. Export one named verb per direction, and
> call them from the single place that knows which case it is.

The live shape, all in `apps/editor/src/stores/config-store.ts`:

- `withoutWrites(storage)` — a pure wrapper returning the same `PersistStorage` with `setItem` and
  `removeItem` neutered and `getItem` live. Exported and unit-tested, which is the arrangement
  `readSavedMarketplaces` established for the untrusted-read half.
- `detachSavedConfig()` — swaps the store onto that wrapper through `persist.setOptions` and records
  that it has, in a module-level flag rather than in state. Recording it through the store would be a
  `set`, which is a write, which is the thing being prevented; `unknownOnLastRead` sits beside it for
  the same reason.
- `readSavedConfig()` — hands the slot back, and is deliberately part of _reading_ rather than a
  second exported verb.

**`removeItem` is neutered too, and that is not thoroughness.** `persist.clearStorage()` reaches
`storage.removeItem` directly rather than through `setItem`, so a slot left with a live `removeItem`
can still be emptied while detached. A slot emptied is a slot written.

**Handing the slot back does more than re-read it.** What is in memory while detached is somebody
else's configuration, so the reattach resets the store to empty **while the pen is still away**, then
reattaches and rehydrates. Reset before reattach, or the emptying is itself a write. And reset at
all, because `merge` meets an empty slot as `undefined` and an unreadable one as a refusal, and both
answer by KEEPING what is already there — correct at every startup, and on the way back from a shared
address it would have a visitor who had saved nothing adopt somebody else's configuration the moment
they touched anything.

**`persist.setOptions({ storage })` only takes effect when the value is truthy** — zustand guards it
with `if (newOptions.storage)` — so passing `undefined` to mean "no storage" silently leaves the
previous one in place. Where the slot may genuinely not exist (a unit runner with no `localStorage`;
`createJSONStorage` returning `undefined`), guard the call rather than passing the empty value
through. `detachSavedConfig` returns early on a falsy slot for exactly that reason.

**"Does the visitor's own data survive this?" is a question about the slot, not the screen.** Read
`localStorage` back directly: a grid showing the right thing proves nothing about what was written
under it, and in this defect the two disagreed. `storedConfig()` on the configure page object is the
one read — `window.localStorage.getItem("agents-inc:config:v1")`, no store, no screen — and
`apps/editor/e2e/specs/shared-link.spec.ts` asserts on it from both ends: "writes nothing to this
browser's saved configuration" edits while the shared address is open, and "writes no borrowed
selection into their slot" edits after navigating back to the visitor's own address the way the
notice tells them to.

### Which stores owe this, and the discriminator that decides

```
grep -rln 'persist(' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

Four — the same four the hydration section's worklist runs over, which prints three because it drops
the one already carrying `skipHydration`. Only `config-store` can be made to hold a foreign
configuration without being asked, and it is the one carrying the machinery above. What keeps each of
the other three out is a different fact each time, and the differences are the point:

| Store               | What actually keeps foreign state out                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-store`          | `partialize` reduces the write to `rosterCollapsed`, which nothing but the visitor's own accordion clicks can populate. Structurally out of reach                                                                                        |
| `marketplace-store` | `remember` is called only from the dialog, and the opening deliberately does not call it for a marketplace a link named. A rule being kept rather than a shape that forbids it — so this is the one to re-read when a new caller appears |
| `saved-stack-store` | Nothing. It takes foreign state today, and that is correct — see below                                                                                                                                                                   |

`RosterPanel` renders on a shared address like any other, and its Save button writes
`toSeedPayload(config)` — whatever configuration is on screen, sharer's or not — into
`agents-inc:saved-stack:v1`. `detachSavedConfig` does not cover it: it swaps `config-store`'s storage
and nothing else's.

**What makes that correct rather than an instance of this defect is the discriminator the whole
section turns on: the write was asked for.** A visitor pressing Save is stating that this selection is
theirs to keep, which is exactly what the slot is for. So the reviewable question is never "can
foreign state reach this slot" — it is **"can it reach it as a consequence of arrival"**. Arrival, a
URL, an import, a background seat: those must write nothing. A press writes what its label says.

---

## A credential is stored under the identity it authorizes, never beside it

**A stored secret is keyed by the thing it grants access to** — the repository, the host, the account.
Never held in a field whose name is only its type (`token`, `apiKey`, `secret`), and never looked up
without naming the identity being reached.

The reason is not tidiness. **A lookup that takes no identity cannot check one**, so the credential is
spent on whoever the caller happens to be reaching — and in a browser the caller is frequently chosen
by someone else, through a link. Keying makes the mismatch unrepresentable instead of something every
call site has to remember.

**The single-slot shape is the tell.** `{ identity, secret }` as sibling fields is a map with one
entry and no key, and it stops being safe the moment a second identity is reachable — which for
anything a URL can address is immediately.

That is what happened here. The editor stored one marketplace and one token in one slot, and
everything that needed a catalogue asked the slot for "the token", never for "the token for THIS
repository", because with one of each there was no difference to express. There was a difference: a
shared address names its OWN marketplace and seats it without storing it, and the dialog's token box
persisted across an edit of the marketplace field. Both fed a `(marketplace, token)` pair that had
never been issued together. The credential goes to api.github.com rather than to an attacker, so
nobody learns its value — but a PAT scoped to one private repository was presented, on a stranger's
instruction, to a repository it was never issued for, and every later read of that repository would do
it again. The dialog path was worse than the link: on a successful load the mismatched pair was
**written**, filing the PAT under a marketplace that had never seen it.

`apps/editor/src/stores/marketplace-store.ts` holds the shape that cannot:
`{ current, saved: Record<marketplace, token> }`. The identity is the KEY and the credential the
VALUE, so a token cannot be reached without naming the repository it belongs to, and
`tokenFor(marketplace)` answers `""` for one this browser holds nothing for. The file states the
asymmetry it rests on — a marketplace **identifies**, so it is the key; a token only **authorizes**
and cannot exist without the repository it is for, so it is the value.

Two consequences to check at review:

1. **Every read passes the identity.** `tokenFor(repo)`, never `state.token`; a read with no argument
   is the defect.

   ```
   grep -rn 'tokenFor(' apps/editor/src --include='*.ts' --include='*.tsx'
   ```

   One declaration, three imports and four calls — the catalogue-first opening, the switch dialog,
   and the marketplace dialog twice (its initial box, and `nameMarketplace` below). Each holds the
   marketplace before it asks. A call passing anything other than the marketplace being reached is
   the regression.

2. **The form that produces the write is bound too.** A field holding a credential is bound to the
   field naming its identity: change the identity and the credential is re-read, never carried.
   `nameMarketplace` in `apps/editor/src/features/configure/components/marketplace-dialog.tsx` calls
   `setToken(tokenFor(canonicalMarketplaceRef(named)))` on every edit of the marketplace field. A form
   that keeps a pasted secret while the target changes underneath it will file the pair, and a stored
   wrong pair is permanent in a way a single wrong request is not.

**Key on the canonical spelling, or the key is not one.** The field accepts several spellings of one
repository, so a lookup on the raw string answers "no credential held" for a repository this browser
holds one for — and then files the pasted PAT under a second key, leaving two entries and two copies
of one PAT. `canonicalMarketplaceRef` (`apps/editor/src/lib/api/catalog.ts`) is applied at the
dialog's lookup and inside `readSavedMarketplaces`, which every slot passes through.

**The check that a keyed lookup actually keys is the header the browser sent, not the store.**
`apps/editor/e2e/specs/marketplace-switch.spec.ts` → "sends no token to a marketplace it holds none
for" records `Authorization` on the intercepted requests and asserts the list is `[null]`. A store
assertion would have passed against the single slot too.

### A discard path added for safety becomes a data-loss path at the next schema change

The same slot absorbed any unparseable blob by returning empty and reporting nothing — so the deploy
that landed the keyed shape would have destroyed every stored PAT, silently, through the code that
exists to be careful. **A persisted store holding something the user cannot re-obtain needs `version`
and `migrate` before its shape changes, and its discard branch needs a `reportIssue`.**

```
grep -rn 'version:\|migrate:' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

`config-store.ts` and `marketplace-store.ts` carry both. `ui-store.ts` carries `version` and no
`migrate`, correctly: everything it persists is a view preference a visitor can re-set in a click.
`saved-stack-store.ts` carries neither and versions through the payload's own `v` instead, which is
stricter — a snapshot minted under an older contract fails to decode rather than being guessed at.
`catalog-store.ts` also matches and is not in the population at all: it is not persisted, and the
`version` it carries is the matrix's. The gap this grep is for is a persisted store holding
unrecoverable user data and answering with none of the three.

**Read `migrate` and `merge` as separate discard doors, because zustand only opens one of them.**
`persist` calls `migrate` when the stored `version` differs from the configured one and hands the raw
state to `merge` otherwise, so a corrupt blob carrying the CURRENT version never reaches the
migration. A store whose reporting lives only in `migrate` is therefore silent on exactly the case a
shape change without a version bump produces.

### What a discard may report is decided by the SCHEMA, not by the reporting site

`config-store`'s `merge` is the worked example of the door, and **two of its three parts are what a
second store copies**: the absent-vs-unreadable **split** — an `undefined` slot is every first visit
and reports nothing, a slot that fails `safeParse` is a loss and reports — and the rule that only
paths and codes travel, never values. **The third part, `issue.path.join(".")`, is not copyable, and
reading the split and the payload as one instruction is what makes this section necessary.**

**A zod path is safe to report in full only when every segment is the schema's own vocabulary.** A
`z.object` field name always is. A `z.record` key is whatever the writer of the data chose, so the
question to ask of a new discard branch is about the schema rather than about the handler: **for each
`z.record` in it, who chose the key?**

| Schema                    | Its `z.record` keys                                               | Safe to join? |
| ------------------------- | ----------------------------------------------------------------- | ------------- |
| `persistedConfigSchema`   | `skills` and `remembered`, by the SEATED catalogue's ids          | **No**        |
| `savedMarketplacesSchema` | **the repository the visitor named**, with their PAT as the value | **No**        |
| `matrixSchema`            | three records, every one keyed by the MARKETPLACE's own ids       | **No**        |

Every row is **No**, and the row that used to read **Yes** is the reason the table is worth reading
rather than skimming. `persistedConfigSchema` was argued safe from `externalSkillId` in
`catalog-store.ts`, which mints `external-<kebab(category)>-<kebab(name)>` and so widens a segment no
further than a searched repository's directory name reduced to `[a-z0-9-]`. **That argument inspects
precisely the class of id that never reaches the slot.** `onlyPersistableSkills` filters _external_
skills OUT and keeps every id the SEATED catalogue holds, and `useCatalogStore.load` seats a fetched
matrix — so on a private marketplace every key in `skills` and in `remembered` is a name the org
chose. Demonstrated rather than argued: with the joined form in place, `config-store.test.ts` ->
"names no skill of the marketplace's own in what it reports" emits
`skills.acme-web-widgets.install: invalid_value`. The schema's third record, `agents`, and the
`assignments` record one level inside an entry are the only safe keys in it, because marketplaces do
not ship sub-agents and those ids come off the vendored `SUB_AGENTS_BY_ID`. **A schema is judged by
its widest record**, so one safe record does not make a row Yes.

`savedMarketplacesSchema` is the sharpest of the three and the difference is one field: `saved` is
keyed by the repository and the credential is the value beside it, so the joined form emits
`saved.acme/private-skills`. That is demonstrated rather than argued too — swapping the joined form
into `readSavedMarketplaces` makes the test emit exactly that string. It truncates to
`String(issue.path[0] ?? "(root)")`, and `marketplace-store.test.ts` -> "names no repository of the
visitor's in what it reports" holds it by stringifying the whole call log and refusing the ref, which
is the assertion shape to copy: a check on the reported field alone passes while the path leaks.

`matrixSchema` has **three** marketplace-keyed records rather than the two its own top level shows:
`categories` and `skills` there, and `matrixStackSchema`'s own `skills`, which is nested two deep —
agent id, then category id — because a stack names the few agents it staffs and the roster is as
marketplace-owned as the skills are. `issuesOf` in `apps/editor/src/lib/api/catalog.ts` answers twice
for that reason: `wholePath` builds the `shown` string, which reaches the dialog of whoever just
fetched this catalogue with their own token and has to locate one broken entry among hundreds, and
`firstSegment` builds the `reported` one. The split is the first segment rather than a walk down to
the first record key, because which depth is safe is a property of the schema and a walk encoding it
in the handler would go quietly wrong the next time `matrixSchema` grows a field.

**Ask where the report goes before asking what is beside it.** Adjacency to a credential decides how
bad a leak is, not whether one occurred. What decides whether one occurred is where the report goes,
and that is fixed rather than open to judgement: `sentry.ts`'s `initSentry` passes
`tunnel: ${env.VITE_API_URL}/monitoring` to `Sentry.init` and calls `setReportingSink` with a
Sentry sink, so every `reportIssue` context and every `reportError` payload transits our own worker
before it reaches Sentry at all. A diagnostics channel is therefore not a neutral place that becomes
sensitive when a secret is nearby — for this codebase it is _specifically_ the infrastructure that
`catalog.ts` fetches browser-direct in order to route around, and its header says so: "an org's
skill names, descriptions and stack philosophy are the org's, so the bytes go from their repository
to their browser and pass through nothing of ours." Any org vocabulary in a report has already
crossed that line, whether or not a token was ever in the same object. Ask where the payload lands
before asking what is beside it; the first question has one answer for the whole app, and the second
has a different answer at every call site.

**A guard is only as deep as the fixture that can reach it.** The guard was already correct and it
sat green over a live leak for months, because a correct assertion proves nothing about a case its
fixture cannot construct. `catalog.test.ts` carried the right shape — stringify the entire
`reportIssue` call log and refuse the private id, exactly the shape `marketplace-store.test.ts`
settled on — and it passed because `MALFORMED_CATALOG` sets `skills: []`, breaking `skills` at the
_top level_. Every path that fixture can produce is one segment long, and a one-segment path can
never contain a record key, which is the only thing the assertion was there to catch. The fixture was
not weak in the ordinary sense of covering too few cases; it was structurally incapable of reaching
the class, so the test's greenness carried no information at all. The rule: when the danger lives in
a path segment, the fixture must fail _inside_ the record, not on it — and a reviewer's check is to
ask what the deepest path the fixture can generate looks like, then compare that depth against the
first `z.record` in the schema. If the fixture bottoms out above that record, the guard is
decorative. Prove it by swapping the redaction out and watching the id appear; a guard that has never
emitted the string it forbids has not been shown to forbid it.

**The census is two questions, and one grep answers only the first.** The path half is every site
that turns zod issues into a reported string:

```
grep -rn 'issue\.path' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Five lines across four files when this was written. `env.schema.ts` joins in full and is outside the
population rather than a safe member of it: it throws an `Error` a developer reads at boot, and
`envSchema` is a `z.object` of build-time variable names with no record anywhere in it. `merge` in
`config-store.ts` and `readSavedMarketplaces` in `marketplace-store.ts` truncate. `catalog.ts` is two
lines because `issuesOf` builds both destinations.

**That grep finds PATH leaks only, and it cannot see a VALUE leak.** `reportPruning` in
`config-store.ts` sent `droppedStackId: before.stackId` under a comment reading _"Catalog slugs and
counts — nothing here describes the user"_ — true while there was one catalogue and it was ours, and
false the moment a marketplace could be seated, because a stack id is `matrixStackSchema.id` and is
as marketplace-owned as a skill id. It is also exactly the report a visitor switching back OFF their
marketplace files, which is when a stack gets pruned. There is no path there to truncate, only a
value not to send; it reports the boolean `droppedStack` now. So the second census is:

```
grep -rn 'reportIssue(' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

read for what each context field CONTAINS rather than for how it was built. Eighteen sites when this
was written — re-derive rather than trusting the number. Most carry an HTTP status or a version
number and are safe by construction; the ones worth reading are every field derived from parsed data.

**One route neither grep can see, left open deliberately.** `error-boundary.tsx` hands the whole
thrown error to `reportError`, which ends at `captureException` — and a `ZodError`'s message is its
issues serialised, `path` included. So a `.parse` that THROWS is a reporting site with no
`issue.path` and no `reportIssue(` anywhere near it. There are two, both over `seedPayloadSchema`,
whose `skills`, `external`, `agents` and `assignments` are records keyed by the seated catalogue's
ids: `toSeedPayload` in `features/configure/lib/seed.ts`, and the round-trip parse in
`features/configure/lib/use-install-command.ts`. Both are left as they are because each parses data
the app itself has just produced, so a rejection is a bug in this codebase rather than an untrusted
input. **That is a judgement about likelihood rather than a proof of safety, and it is the one
remaining hole in this section** — a throw on either path reports a private catalogue's skill id in
full, and no census written around a call site will ever name it.

---

## A `reportIssue` about the user's own work is not a substitute for telling them

The sections above settle what a report may CONTAIN. This one settles whether a report is enough on
its own, and the answer is no: **where the app reports a loss of the user's own work to
observability, the same event owes a user-facing statement — or a comment at the `reportIssue` call
site saying why this one does not.** An issue filed to a dashboard the user cannot see is a record
that we noticed, not that we said.

The reason this needs stating is that the failing shape reads as diligence rather than as an
omission. `config-store.ts`'s `reportPruning` counts the dropped ids, distinguishes a dropped stack
from dropped skills through `droppedAnything`, and sits under a careful comment about not leaking the
visitor's own data into the report. The code plainly _knows_. What it knows never crossed back to the
person it happened to, and a reader auditing the file finds thorough handling of exactly the event
that went unmentioned.

**What makes it a defect rather than a judgement call is that the same feature already does it the
other way.** `seed.ts`'s `unknownPayloadIds` and `use-catalog-first.ts`'s `droppedNotice` have named
every id a shared link lost, in a sentence written to be read by a person. One loss, two doors: one
door told the visitor, the other told Sentry — and where the report goes is not open to judgement,
since `initSentry` calls `setReportingSink` with a Sentry sink and tunnels through our own worker, as
above. The correction was to give the silent door the loud door's own words: `unknownSavedIds(before,
after)` beside the existing `reportPruning` family, `readSavedConfig` answering with it, and
`droppedNotice` composing the sentence at both doors.

The exceptions are real and are what the comment is for: `migrateConfig` in
`stores/persisted-schema.ts` discards a blob from a version it cannot read, and at the moment that
happens there is nowhere on screen for a sentence to land.

**The assertion half, because it is what held the silence in place.** A negative assertion about
user-facing output is a substantive product claim, and it is the one shape of assertion that gets
_stronger_ as the app loses behaviour — the emptier the screen, the greener the test, while every
other assertion in a suite fails when the app does less. A `toBeHidden()` on the import notice pinned
"an afternoon of configuration disappears with nothing on screen" as correct, in the suite whose
whole subject is that catalogue drift must be survivable out loud. **An assertion that a user-facing
surface is empty carries a comment naming what would otherwise have been there and why it should not
be; and where the same path emits a `reportIssue`, the two are reconciled before the assertion is
written, because one of them is wrong.**

The evidence had been in the run output the whole time — `[issue] Pruned saved ids the catalog no
longer knows {"droppedIds":6}` on the `[WebServer]` line immediately above the green tick for the
test asserting that nothing needed saying. Playwright already pipes those warnings into the run
through `webServer.stderr: "pipe"` and nothing reads them. The mechanical close is a fixture that
collects `console` events matching `[issue]` and fails a test that emitted one it did not declare,
with an opt-in escape hatch so the specs that deliberately provoke a discard declare it rather than
being exempted wholesale. **The seam exists and its sibling is the shape to copy**:
`apps/editor/e2e/fixtures.ts` overrides the `page` fixture to route every third-party origin to
`route.abort("blockedbyclient")`, collect what it caught, and assert in teardown that the collection
is empty. Both halves of that pairing are load-bearing — the abort keeps the bytes out, and the
teardown assertion is what makes an omission legible.

---

## A refusal body is quoted only where this CLI is its audience, and only where it adds to the status

The worker writes its refusals for whoever asked. A browser and a terminal are not the same reader,
and a body that helps one can be actively wrong for the other — so **a client quoting a refusal body
owes two judgements before it prints one word of it.**

**Is this client the body's audience?** `refuseAnotherSeedVersion` in `apps/server/src/index.ts`
answers a 409 with `Reload the page: …`, which is the whole fix for the caller that refusal was
designed around — a tab minting from a bundle older than the last deploy. There is no page in a
terminal, so `publish-seed.ts` branches on the STATUS ahead of any body read and says the fact in the
CLI's own words instead. Quoting would have been worse than the bare status, which at least does not
send the reader somewhere that does not exist. Where the client is not the audience, say the fact
yourself or say nothing; do not paraphrase somebody else's remedy.

**Does the body add anything to the status printed beside it?** Compare against `node:http`'s
`STATUS_CODES` — the registry of reason phrases a status line already carries — case-insensitively
and against the trimmed body, since a worker writing sentence case and a registry writing title case
is not a difference in meaning. `restatesItsOwnStatus` in `src/cli/lib/seed/publish-seed.ts` is the
implementation. **Compare against the registry rather than listing the statuses you have seen**: the
list form catches `Too many requests` and `Payload too large` today and lets the next refusal written
the same way through on the day it ships, where the registry comparison is a rule about the class and
suppresses it for free. `Could not store this config` is not `Service Unavailable`, which is why the
one refusal on that route naming a cause is the one that survives — the test being whether the body
says something the number could not.

Two bounds sit underneath both judgements and are not optional: **a budget** — `EXPLANATION_BUDGET`,
per route rather than shared, because a budget measures a route — and **attribution**, since what
survives is printed as `The store said: …` and never in the client's own voice. A content-type header
is not proof of provenance, so those two are the containment; the type check only decides which arm
reads the body.

**The pairing this needs in its suite is a permitted case beside every suppressed one.** A spec
asserting only that a body was dropped cannot tell a rule scoped to restatement from one that has
swallowed every quote on the route. `publish-seed.test.ts` holds both restating statuses, so the rule
reads as general rather than as one case, and holds the quoted 503 beside them.

---

## Where a surface shows A in place of B, the condition that hides B is "A arrived" — never "A was attempted"

The two read identically on the happy path and diverge exactly where the work failed, which is the
one state the surface was drawn to handle.

The editor's stack grid shows an account's stacks in place of the browser's local slot — one list
rather than two that can disagree. What must hide the slot is the account **holding this browser's
work**, not adoption having been tried. `adoptLocalStack` in `apps/editor/src/stores/account-store.ts`
does not re-upload into an account that already has rows, and its early return once answered `null`
for both readings: NOT ATTEMPTED and ADOPTED came back the same, so a reload after a refused sign-in
found one unrelated row in the account, never re-tried adoption, and dropped the refused slot off the
grid in silence. It now recomputes the reason on that branch from `writeContractRefusal` — a
`safeParse` against `installableSeedPayloadSchema`, needing no request — because a payload the write
contract refuses could not have reached that account by any route, so the answer is free and it is
certain.

**The corollary is that the flag is a fact about the SUBJECT, not about the container.** `unadopted`
says why THIS SNAPSHOT is not in the account; it is not shorthand for "the account's list is empty".
Read the second way it acquires an invariant somebody then has to maintain, and `save` maintained it
by clearing the flag on every save — including a save of a different selection, which leaves the
snapshot exactly where it was and drops its notice one save later. **Only what actually reaches the
subject may clear the flag**: adoption carrying the snapshot in, or a sign-out handing the grid back
to it.

Both halves cost a guarantee that was never worth what it bought. Two cells reading "Saved stack" is
now reachable, and is the accepted outcome rather than a case the store rules out — every signed-in
save is named that anyway, and the two are told apart by their second line, since the local slot
lists the skills it holds where an account's row can only say it is in the account. **Sharing a name
is a smaller harm than losing the work.**

---

## The store holds the refusal; the surface owns the words

**A refusal crosses a boundary as a CODE and is turned into a sentence by whatever is drawing.**
Three seams in this repository run the same split, and it is one rule rather than three habits:

| Refusal                | Held as                                                        | Worded by                             |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------- |
| Share / install POST   | `ShareRefusal` in `apps/editor/src/lib/api/configs.ts`         | the button that was pressed           |
| Compose                | `ComposeRefusal` in `apps/editor/src/lib/api/compose.ts`       | `REFUSAL_COPY` in `composer.tsx`      |
| First-sign-in adoption | `AdoptionRefusal` in `apps/editor/src/stores/account-store.ts` | `WHY_NOT_ADOPTED` in `stack-grid.tsx` |

Two reasons, and the second is the one that gets forgotten.

**A code is a SITUATION and a sentence is an audience.** A button has room for three words and a
dialog has room for a sentence; the same refusal is worded differently in each, so a message composed
at the seam is a string nothing renders. `ShareRefusal` is four members and `ComposeRefusal` is five
for exactly this reason — they are different situations for the person at the keyboard, and only some
of them name an action.

**A sentence read off a response can turn out to be advice written for somebody else's client.** The
rule above is the same fact from the CLI's end. So a client reads a code and never prose:
`refusalFor` in `compose.ts` reads the worker's 400 BODY to tell an over-long sentence from a blank
one — the worker spends one status on two guards and names which fired — and what it reads is the
code `"too long"`, never a sentence to display. Everything it cannot read degrades to the generic
member, which is exactly what the status alone produced before any body was read.

**A refusal is also where a surface decides what NOT to report.** `composeProposal` in
`apps/editor/src/lib/api/compose.ts` keys its
`reportIssue` on the refusal rather than on the status, because signed-out, rate-limited and
over-long are ordinary — a lapsed session, the limiter working, a guard turning away something
somebody typed. Sending them drowns the signal in expected traffic on the one route that spends money
per call. A length refusal that arrived as the generic member paged the alert channel for a request
that never cost anything.

**And the worker's own guard ORDER is part of the same contract.** `/compose` runs its length and
blank guards ahead of the rate limiter, because those two reach no model and cost nothing: counting
them charged a caller for work that never happened, and told somebody who pasted a long paragraph
twice that they had made too many requests — a second wrong message caused by the first, describing
neither. A limiter belongs above everything that SPENDS and below every guard that does not.

---

## An act reachable through two controls is a module, not a component

**Ask "what else performs this act?" of every state-changing operation, before writing the second
one.** Where the answer is more than one control, the act needs a named home — a lib module — and the
rules belong there rather than on whichever component implemented it first.
`features/configure/lib/marketplace-switch.ts` is that home for seating a catalogue: it owns the
sentence (`switchConsequence`) and the decision (`dropsSelection`), because each door has to decide
whether there is a consequence worth naming before it can name one, and reading the sentence back to
find out would make the two doors agree by coincidence. **The count of doors goes in that module's
header**, so a third door's author finds the contract by looking for the act rather than by
remembering to read a comment somewhere else — the header states two, the switcher's CTA and the
marketplace dialog's Load, which carries the public catalogue as a target of its own (`PUBLIC_TARGET`)
rather than as a third path.

Three separable reasons the drift happened, because each is a different lesson:

1. **The rule was attached to a component, not to the operation.** Nothing named "seating a
   catalogue" existed as a thing with rules; there were two components that each happened to do it,
   and the second reproduced the parts its author could see on screen.
2. **The predictive comment sat on the callee.** `pruneToCatalog`'s own comment described this exact
   failure — hidden from the grid is not dropped, so the ids would still be in the install list and
   in any link shared from here — and someone writing a new seat path never opens it, because they
   are not calling it. That is the defect rather than a coincidence: a warning readable only from
   inside the guard cannot reach the door that lacks one.
3. **A third door existed and nobody counted it.** Clearing the field seated the vendored catalogue
   and had the same gap, and it was the ONLY route to the public catalogue, since the switcher lists
   saved marketplaces and the public one is never saved.

What it cost: one shared payload naming a single marketplace ref beside ids from two of them. The CLI
resolves every id against the ref at the top, so the receiver installs a subset and the sharer is
never told.

### The corollary: a hook that reads a store outside React

`catalog-store.ts` exports `activeCatalog`, `activeStacks`, `activeVersion`, `activeMarketplace`,
`activeSkillById` and `activeExternalSkill` — each a `useCatalogStore.getState()` read, non-reactive
by construction. **A `useMemo`, `useEffect` or `useCallback` whose callback reaches one of them has a
dependency the array cannot see, and `exhaustive-deps` will never flag it: the rule flags such a
value as UNNECESSARY once you add it, which is the opposite advice.** Removing it on the rule's word
leaves a derivation stamped with whichever catalogue was seated when the selection was made.

The answer is settled and is to be copied rather than rediscovered: **subscribe with a selector purely
to name the value in the dependency array, and disable the rule with a comment saying that is what
the dependency is for.** Two sites carry it — `configure-screen.tsx`, where `catalog` is subscribed
so `selectDomainViews` re-derives the grid when the catalogue underneath it is swapped; and
`use-install-command.ts`, where `marketplace` and `version` are subscribed so the serialised payload
is re-minted on the same event, since `toSeedPayload` takes both off the seat. It has been
rediscovered twice, once per site, and the second site's comment says so.

The population to read is every `active*` call that sits inside a hook callback:

```
grep -rnP 'active(Catalog|Stacks|Version|Marketplace|SkillById|ExternalSkill)\(' apps/editor/src --include='*.ts' --include='*.tsx'
```

Most hits are in `derive.ts` and other plain functions, where reading the seat directly is correct
and there is no dependency array to lie about it. The hits that matter are the ones inside a memo or
an effect, and there the question is whether the array names the seat.

---

## What a first-time visitor downloads is a claim the build checks, not a number someone remembers

**The editor ships one HTML page, so every byte of JavaScript it references is paid before anything
appears.** That cost is invisible from every gate this repository already had: `tsc`, ESLint, both
suites and the Playwright run are equally green whether the entry chunk is 90 KB or 1 MB, and the
Playwright suite in particular drives a **dev server**, where nothing is chunked at all. So the only
place the question can be asked is inside `vite build`, against the bytes it just emitted — which is
where `apps/editor/scripts/first-paint-budget.ts` asks it, as a plugin `vite.config.ts` installs.

It makes two claims, and both fail the build:

1. **The first-paint payload fits a gzipped budget.** The payload is the entry chunk, every chunk it
   imports statically — those are exactly the ones the emitted HTML `modulepreload`s — and every
   stylesheet. A chunk reached only through `import()` is deliberately not counted; keeping weight
   out of the static graph is the behaviour the budget exists to reward.
2. **No chunk carries this repository's own source and a `node_modules` module together.** That is
   the caching property stated as a property of the artefact rather than of the config that produced
   it, so a grouping rule that stops matching — a renamed directory, a `/` where `[\\/]` was meant —
   reports itself instead of silently merging the tiers back.

**One number over the whole payload rather than an assertion per dependency**, because the defect
has one shape and many spellings: a static import of something only used behind a click, an upgrade
that doubles a library, a chunking rule that drags a lazily-loaded module into the static graph. A
list of per-package assertions catches only the spellings someone thought of.

### The chunk groups are ordered by rate of change, and two of their settings are load-bearing

`build.rolldownOptions.output.codeSplitting.groups` in `apps/editor/vite.config.ts` names five
tiers — React, the brand icons, the observability SDK, a catch-all vendor group, and the generated
catalogue from `packages/matrix`. The axis is how often each changes, because that is what decides
whether a returning visitor re-downloads it. Before the split the whole app was one 1.03 MB file
(302 KB gzipped) and a one-line copy edit re-hashed all of it; after, an app-source edit re-hashes
only the 94 KB entry chunk and the other seven keep their file names — verified by building twice
with a single line appended to one module and diffing the emitted names.

Two settings look like tuning and are not:

- **`vendor` must outrank `catalog` in `priority`.** A group captures its matches' dependencies as
  well as its matches (`includeDependenciesRecursively`, on by default, and turning it off is
  documented in rolldown as risking invalid chunks), so the lower-priority catalogue group would
  otherwise swallow zod — 18 KB of an unchanging library re-downloaded every time the marketplace is
  regenerated.
- **`entriesAware: true` on the catch-all.** Without it, a `test: /node_modules/` group collects a
  dependency reached ONLY through `import()` and hoists it into the static graph. That is not
  hypothetical: it happened to `posthog-js` on the first attempt, put 74 KB back on the first-paint
  path, and read as a tidier list of chunks while doing it. The budget is what caught it.

### Reading the number

It is gzip, at level 9, because nothing is served uncompressed and raw bytes describe a transfer
that never happens. Cloudflare negotiates brotli with most browsers and brotli at quality 11
measured ~15% smaller on this bundle, so the gate's figure is the conservative one — and the cheap
one, at ~60ms against ~2s for brotli on every build. **The same bytes read about 2% smaller under
Bun's zlib than under Node's**, so the budget clears the larger reading and a build run either way
gives the same verdict.

**When the gate fires, the first question is whether the new weight can be loaded on demand**, not
what the budget should be raised to. The number is a record of a measured cost; raising it is
allowed, as a deliberate edit with a reason written beside it.
