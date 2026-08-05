# Cross-cutting documentation

Documents that describe types, contracts or behaviour spanning more than one workspace — things
neither the CLI nor a web app can own alone, because both halves implement them. Created 2026-08-06
when documentation ownership was settled: the site (`apps/www`) owns everything a user reads, the
CLI's `docs/cli/` owns CLI contributor material, editor material lives in `docs/web/`, and whatever
genuinely spans the halves lives here.

Empty is a valid state — nothing is filed here until it truly crosses the boundary. The first
expected residents are the kind of thing the seed wire contract is: one shape, two implementers, and
today documented only beside the code (`packages/matrix/src/seed.ts` and the CLI's vendored copy,
held together by a drift test).

Not to be confused with `packages/cli/.ai-docs/`, which is reference material written for AI agents
working on the CLI, or `todo/`, which tracks outstanding work.
