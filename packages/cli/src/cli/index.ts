import { run, flush, Errors } from "@oclif/core";

run(undefined, import.meta.url)
  .then(() => flush())
  // Errors.handle needs an Error; a non-Error rejection would fail inside it.
  .catch((error: unknown) =>
    Errors.handle(error instanceof Error ? error : new Error(String(error))),
  );
