---
type: anti-pattern
severity: high
affected_files:
  - apps/server/src/compose.ts
  - apps/server/src/index.ts
  - apps/editor/src/lib/api/compose.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-09-02
reporting_agent: web-developer
category: architecture
domain: api
root_cause: missing-rule
status: resolved
resolved_by: >-
  The `COMPOSE_CALLS.limit()` call in apps/server/src/compose.ts moved below the empty-sentence
  and length guards, so a request refused before the model is reached no longer spends an
  allowance. Two specs in apps/server/src/compose.test.ts hold both directions — one sends more
  over-long sentences than the whole minute's allowance and then asserts an ordinary sentence
  still answers 200, the other asserts the allowance is still spent by every sentence that does
  reach the model, which is what makes the change a reordering rather than a removal. The
  discriminator half is `refusalFor` in apps/editor/src/lib/api/compose.ts, which reads the
  worker's 400 body rather than its status.
---

## What Was Wrong

**A rate limiter ran above a guard that refuses for free, so requests that cost nothing spent
the allowance meant for requests that cost money.**

`POST /compose` in `apps/server/src/compose.ts` called `c.env.COMPOSE_CALLS.limit()` as its first
statement, and only then trimmed the sentence and applied two guards — empty, and past
`MAX_SENTENCE`. Both guards return 400 without calling Anthropic, and the source says so on the
line above them ("Refused BEFORE the model is reached, both of them"). The allowance is 10 a
minute (`wrangler.jsonc`, binding `COMPOSE_CALLS`). So eleven over-long pastes exhausted a quota
that exists to bound model spend, without a single call to the model.

**The damage is that the two failures compound into a third thing that is true of neither.** A
visitor pasting a long paragraph got a refusal; pasting it a few more times, the refusals stopped
saying anything about length and started saying `too many requests`. Neither message described
what had happened, and the second was caused by the first. Reproduced before the fix:

```
$ npx vitest run src/compose.test.ts -t "spends no allowance"
AssertionError: expected 429 to be 400
```

**Census of limiter placement — both sites in the worker, which is the whole population:**

```
grep -rn '\.limit({' apps/server/src --include='*.ts'
```

| Site                                          | What it meters                                       | Correct position                  | Was it right?       |
| --------------------------------------------- | ---------------------------------------------------- | --------------------------------- | ------------------- |
| `COMPOSE_CALLS`, `apps/server/src/compose.ts` | Anthropic spend, keyed by user id                    | Above the model, below the guards | **No** — fixed here |
| `CONFIG_WRITES`, `apps/server/src/index.ts`   | Request volume into KV, keyed by IP, unauthenticated | Above everything                  | Yes                 |

The contrast is the point, and it is why the rule is not "limiters go below guards".
`CONFIG_WRITES` is deliberately the first thing `POST /configs` does, and its own comment in
`stacks.test.ts` says why: "the limit is checked BEFORE the body is parsed, so a refusal costs
nothing to produce and a flood of rubbish is turned away as cheaply as a flood of valid shares."
That is correct for a limiter whose job is bounding **requests** from anonymous callers. It is
exactly wrong for one whose job is bounding **spend** from an identified caller, and the two were
written in the same worker three weeks apart.

## The Second Half: A Status That Is Not the Discriminator

The same route spends **one 400 on two guards** and names which in the body. The editor's client
read `response.status` only, mapped every unnamed status to one `refused` member, and the composer
drew that as "The model did not answer. Nothing changed." — which was not merely unhelpful but
**false**, since both 400 guards run before the model is called. It also reached `reportIssue`,
under a comment reserving that channel for the route that spends money on every call, so a
refusal that cost nothing paged the alert channel.

This is the family of `2026-09-01-refused-http-body-discarded-at-network-boundaries.md` arriving
in the editor rather than the CLI, with one difference worth recording: the CLI reads a refusal's
body for its **prose**, and the editor must read it for its **code** only. The worker sends
`{ error: "too long" }` and the editor owns the sentence, which is the same division
`ShareRefusal` draws — and it is what stops the editor rendering advice written for somebody
else's client, the failure
`2026-09-01-a-refusals-body-is-quoted-only-where-the-cli-is-its-audience.md` records.

**Census of the same shape — every status the worker spends on more than one meaning:**

```
grep -rhoE '\{ error: "[^"]+" \}, [0-9]{3}' apps/server/src/*.ts | sort
```

Two statuses carry two bodies each. `/compose` **400** (`empty` / `too long`) is the member fixed
here. `/compose` **502** (`unparseable` / `the model did not answer`) is a **deliberate** collapse
and was left alone: both mean "the model produced nothing usable", they are one situation for the
person at the keyboard, and `packages/api-mocks/src/handlers.ts` already says so in as many words
("One handler for both because the worker spends one status on them"). `/monitoring`'s two 400s
are not members — no code in the editor calls that route.

## Fix Applied

- `apps/server/src/compose.ts`: the `COMPOSE_CALLS.limit()` call moved below both guards, with a
  comment stating what is above it and what is below it and why each half is load-bearing.
- `apps/editor/src/lib/api/compose.ts`: a `too-long` member on `ComposeRefusal`, and `refusalFor`,
  which answers by status for every status except 400 and by body for that one. It degrades to
  `refused` for a body that is empty, unparseable, or of another shape, with the read guarded as
  well as the parse.
- `apps/editor/src/features/configure/components/composer.tsx`: copy naming the problem and the
  action.
- `packages/api-mocks/src/handlers.ts`: `composeTooLongHandler`, the 400 carrying the worker's
  body. Kept separate from `composeRefusedHandlerFor`, whose bodiless 400 is now the degrade
  double — a double keyed on the status alone would mint one answer for two guards.

## Proposed Standard

Add to `.ai-docs/standards/editor-and-worker.md`, beside the existing rules on what a caller may
assume about the worker's answers:

> **A rate limiter belongs immediately above the thing it meters, and nowhere else.** Placing it
> higher charges callers for work the route then refuses to do; placing it lower leaves the metered
> resource unprotected. Name the cost before choosing the position — a limiter bounding SPEND goes
> above the call that spends and below every guard that refuses for free, and a limiter bounding
> REQUEST VOLUME goes above everything, so that a cheap refusal stays cheap. Both shapes are live
> in this worker and the difference between them is not visible from the binding name.
>
> The tell that it is wrong: a refusal message that is caused by an earlier refusal. If exhausting
> the allowance is reachable without reaching the metered resource, the limiter is too high.

> **A status is only a discriminator where the route spends one status on one meaning.** Where it
> spends one on several, the discriminator is in the body, and a client mapping by status alone
> will narrate a refusal as whichever sibling it happened to key. Read the body for the CODE, and
> keep the words on the client — the worker names the situation, the client owns the sentence.
> Degrade to the by-status answer for anything unreadable, guarding the read as well as the parse.

Neither conflicts with a `CLAUDE.md` NEVER/ALWAYS rule. The second is the editor-side completion of
the two `2026-09-01` findings above, which established that a refusal's body is evidence and that
it is quoted only where the reader is its audience; this adds the case where the body is not quoted
at all because it is a code rather than prose.

## What Would Catch It

**Nothing static.** A limiter one line too high type-checks, lints and passes every existing test,
and its symptom is a message that is merely wrong rather than an error. The same is true of a
status-keyed refusal map: it is a total function over statuses and has no missing case to report.

What holds each half is a specific test, and both were watched failing first:

| Claim                                        | What fails if it breaks                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A length refusal spends no allowance         | `compose.test.ts` → "spends no allowance on a sentence it refuses for length"            |
| Everything reaching the model still does     | `compose.test.ts` → "still spends an allowance on every sentence that reaches the model" |
| A 400 is told apart by its body              | `compose.test.ts` (editor) → "names a sentence past the worker's cap"                    |
| An unreadable 400 still degrades             | `compose.test.ts` (editor) → "falls back to a plain refusal for a 400 it cannot read"    |
| The visitor is told what actually went wrong | `composer.spec.ts` → the `a refusal` table's fourth row                                  |

The second and fourth rows are the ones worth keeping. Each pins the arm that a careless fix
removes, and neither would have failed against the original code — so both were shown to fail
against a deliberately wrong implementation instead. Keying the client on `status === 400` alone
reddens the fourth row with `expected { refusal: 'too-long' } to strictly equal { refusal:
'refused' }`, which is the whole reason it is a separate test rather than a second assertion in
the third.
