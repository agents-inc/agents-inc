import { run, flush, Errors } from "@oclif/core";

run(undefined, import.meta.url)
  .then(() => flush())
  // oclif's handler takes an `Error`, and a rejection reason is `unknown` — a
  // throw of a non-Error would otherwise reach it and fail inside the handler,
  // losing the message it was carrying.
  .catch((error: unknown) =>
    Errors.handle(error instanceof Error ? error : new Error(String(error))),
  );
