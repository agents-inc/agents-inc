import { run, flush, Errors } from "@oclif/core";

run(undefined, import.meta.url)
  .then(() => flush())
  .catch((error) => Errors.handle(error));
