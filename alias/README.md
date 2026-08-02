# agents-inc

Alias for [`@agents-inc/cli`](https://www.npmjs.com/package/@agents-inc/cli) so the short form works:

```sh
npx agents-inc init
```

Installing this package pulls in the real CLI; this package only forwards to it.
The command this alias installs is `agents-inc`; the main package installs both `agents-inc` and
`agentsinc`.

Because both packages now ship an `agents-inc` bin, installing BOTH globally puts two packages in
the race for that name and npm links whichever was installed last — install one or the other, not
both.

## Versioning

This package is published **in lockstep with `@agents-inc/cli`, at the same version number**,
even though its own three lines never change.

That is not cosmetic. `npx` caches by package spec: it resolves `agents-inc` to the latest
version, and if that version is already cached it reuses the whole cached install — including
the `@agents-inc/cli` it resolved on first run. An alias whose version never moved would leave
repeat `npx agents-inc` users pinned to whatever CLI version they happened to pull first, no
matter how many releases followed. Bumping in lockstep is what busts that cache.

So: **every `@agents-inc/cli` release must republish this package at the matching version.**
It is step 8 of the release checklist in `.ai-docs/standards/commit-protocol.md`.
