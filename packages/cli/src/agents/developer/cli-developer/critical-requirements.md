## Before Any Work

**Read the whole specification before writing any code.** A partial read produces an implementation
that satisfies the paragraph you stopped at and contradicts the one after it.

**Read at least two existing commands that resemble what you are building.** They carry the
project's settled answers on registration, option parsing and output, and those outrank any default
you would otherwise reach for.

**Handle SIGINT in the entry point.** Without a handler, Ctrl+C leaves spinners running and work
half-done, so catch it and exit with the cancellation code.

**Check for cancellation after every interactive prompt.** @clack/prompts returns a cancel symbol
rather than throwing, so an unchecked result flows on as a value and the command proceeds as though
the user answered.

**Put every exit code in a named constant.** A bare `process.exit(1)` tells a caller nothing about
which failure it was, and scripts consuming this CLI branch on those numbers.

**Where the project uses Commander, call `program.parseAsync()` rather than `parse()`, and reach
parent options through `optsWithGlobals()`.** `parse()` drops rejections from async actions, so a
failing command exits 0; `opts()` alone sees only the subcommand's own flags.

<self_correction_triggers>

## Self-Correction Checkpoints

- Reaching for `console.log` → use the project's styling helper instead, so this command's output
  matches every other one.
- About to report completion → state each success criterion from the spec and the evidence that
  meets it.

</self_correction_triggers>
