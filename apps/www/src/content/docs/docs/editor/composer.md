---
title: The composer
description: Describe a project in a sentence and get the skills for it back as a proposal — what the model is allowed to decide, what it is not, and why applying one can only reach a configuration you could have clicked to by hand.
sidebar:
  order: 3
---

The composer is the field at the foot of the roster column. Write a sentence
describing what you are building, and it returns the skills for it — as a
proposal you read first, not a selection it makes for you.

It is the route for a project that does not exist yet. There is no code to
detect anything from, and you should not have to learn a catalogue to get
started in it. For a project that _does_ exist, the better route reads the code:
[Adding to an existing project](/docs/guides/adding-to-an-existing-project).

## Quick start

1. Sign in with GitHub. The composer calls a model, so the cost has to be
   attributable to somebody; the rest of the editor works signed out.
2. Type a sentence into the field at the foot of the roster —
   _"a Next.js app with Postgres and Playwright tests"_ will do.
3. Press **Send**, or <kbd>⌘</kbd><kbd>↩</kbd> (<kbd>Ctrl</kbd><kbd>↩</kbd> off
   a Mac). A plain <kbd>Enter</kbd> inserts a newline — the field takes prose.
4. Read the proposal that appears above the field, then **Apply** or
   **Discard**.

**Nothing changes until you apply.** Sending is not applying, and neither is
discarding.

## What comes back

A list of skills, and one short sentence saying why. That is the whole answer.

Each row names a skill and the load it will rest at once selected. Skills you
have already selected are **dropped from the proposal rather than listed** —
proposing something you already have reads as a change that will not happen.

**Apply** selects them. **Discard** removes the block and leaves your sentence
in the field, because the usual next move is rephrasing rather than starting
again.

## What the model is not allowed to decide

Almost everything, and this is the design rather than a limitation.

The model returns **skill ids and a sentence**. It says nothing about scope,
install mode, which sub-agents carry what, whether each copy is preloaded, or
any sub-agent's model and reasoning effort. Those are derived from the same
rules the CLI generates from — so a model with an opinion about them would
produce a configuration the CLI then contradicts. Two sources for one answer is
how they come to disagree.

**Its ids are not trusted either.** They are filtered against the catalogue
before the editor draws anything, so a plausible near-miss — an id that looks
exactly like one of ours and is not — is silently absent rather than a broken
row.

**Applying goes through the same verb a click does.** Each proposed skill is
selected the way clicking its cell selects it, one at a time, so the
incompatibility rules, the implied skills and the exclusive-category swaps all
run exactly as they would for a click. A proposal cannot reach a configuration
you could not have reached by hand — it is a faster route to the same grid, not
a second way of writing to it.

## Editing the sentence voids the answer

A proposal belongs to the sentence it was asked for. Change the sentence and the
proposal goes, because a stale answer under a changed question is worse than no
answer.

That holds mid-flight too: if you rephrase while a request is still running, the
answer is dropped when it arrives rather than drawn under the new sentence.

**Nothing here is persisted.** The draft and the proposal are local to the
page — they do not survive a reload, and they are not part of your
configuration until you apply them.

## When it refuses

Five endings. Signing in and shortening the sentence are the two you can act
on.

| What it says                                          | What happened                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `Sign in to use the composer — nothing was sent.`     | You are signed out. Nothing left the browser.                 |
| `Too many requests in a minute. Try again shortly.`   | Ten calls a minute, per person. Wait.                         |
| `That is too long to send. Shorten it and try again.` | Over **600 characters**. Refused before the model was called. |
| `The model did not answer. Nothing changed.`          | The call failed upstream.                                     |
| `Could not reach the composer. Nothing changed.`      | The network did.                                              |

The 600-character cap is a real limit rather than a nicety — input tokens are
billed, so an unbounded prompt is an unbounded bill.

One refusal never leaves the browser at all: a blank sentence. **Send** is out
of reach while the field is empty or holds only spaces, and
<kbd>⌘</kbd><kbd>↩</kbd> refuses on the same check.

## What it is not

**It is not a chat.** There is no thread, no history and no follow-up turn. One
sentence, one proposal, and the proposal is a changeset rather than a reply.

**It is not the only way to change a selection.** Anything the composer can do
you can do in the grid, and several things only the grid can do — routing a
skill to one sub-agent, pinning a model, adding a skill from outside the
catalogue. [Selecting skills](/docs/editor/selecting-skills) covers those.

**It does not install.** Like everything else in the editor it ends at the
install dialog and a command you run —
[Installing and sharing](/docs/editor/install-and-share).

## Where to go next

- [Four ways in](/docs/ways-in) — the composer beside the other three routes.
- [Selecting skills](/docs/editor/selecting-skills) — the grid the composer
  writes into.
- [Adding to an existing project](/docs/guides/adding-to-an-existing-project) —
  the same job when there is already code to read.
