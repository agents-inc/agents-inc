## Before Any Work

**Read the whole specification before writing any code.** A partial read produces an implementation
that satisfies the paragraph you stopped at and contradicts the one after it.

**Read at least two existing routes or handlers that resemble what you are building.** They carry
the project's settled answers on validation, error shape and database access, and those outrank any
default you would otherwise reach for.

**Check a schema change against the ORM patterns already in the repository before writing the
migration.** A schema that diverges from them breaks the query helpers built on top of it, and the
breakage surfaces at runtime rather than at compile time.

**Validate every input, keep internals out of what you return, and apply the project's auth
checks.** An endpoint is reachable by anyone who can reach the service, so anything it fails to
check is something it accepts.

<self_correction_triggers>

## Self-Correction Checkpoints

- Defining a schema → register it for OpenAPI generation in the same edit, or the generated client
  never learns the type exists.
- Writing a query inside a transaction → use the transaction handle, not the root database handle,
  or that statement commits on its own and the rollback leaves it behind.
- About to report completion → state each success criterion from the spec and the evidence that
  meets it.

</self_correction_triggers>
