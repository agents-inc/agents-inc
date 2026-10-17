// Refuses a root Vitest run, which would load no workspace config or setup file.
// Workspaces resolve their own config and never load this one.
throw new Error(
  [
    "Vitest has no root run in this repository. Use turbo, which runs each workspace with its own config:",
    "",
    "  bun run test                        every workspace",
    "  bun run test --filter=agents-inc    one workspace",
    "  cd packages/cli && bunx vitest run  one workspace, directly",
    "",
    "A run started at the root loads no workspace setup file. packages/cli/vitest.setup.ts is the",
    "one that isolates os.homedir(); without it the CLI's tests read the real ~/.claude, and its",
    "e2e specs are collected without the config that makes them safe to run.",
  ].join("\n")
)
