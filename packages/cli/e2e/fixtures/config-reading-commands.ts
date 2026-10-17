import { cp, rm } from "fs/promises";

import { CLI, type CLIResult } from "./cli.js";
import { E2E_SKILL } from "./expected-values.js";
import { InteractivePrompt } from "./interactive-prompt.js";
import { runShare, type SeedConfigRequest, type SeedConfigStore } from "./seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  fileExists,
  getEjectedTemplatePath,
  readTreeSnapshot,
  writeCorruptConfig,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

// Every command that reads config.ts. Over an existing but unloadable config each refuses with the
// same message; `doctor` and `uninstall` keep working and are driven by each spec itself.

export const EMPTY_CONFIG_FILE = "";

// The schema-refused shape names the fixture marketplace, so a command reading past the fault
// answers from the fixture rather than fetching the public catalogue.
export const UNREADABLE_CONFIG_SHAPES = [
  { shape: "is empty", body: EMPTY_CONFIG_FILE },
  {
    shape: "names its marketplace beside a field the installation schema refuses",
    body: renderSchemaViolatingConfigTs(E2E_SOURCE.sourceDir),
  },
  { shape: "does not parse", body: renderUnparseableConfigTs() },
] as const;

const SEARCH_QUERY = E2E_SKILL.react.slug;

const NON_INTERACTIVE_CONFIG_READERS = [
  { name: "compile", args: ["compile"] },
  { name: "update", args: ["update"] },
  { name: "eject templates", args: ["eject", "templates"] },
  { name: "eject skills", args: ["eject", "skills"] },
  { name: "search", args: ["search", SEARCH_QUERY] },
  { name: "list", args: ["list"] },
] as const;

export const CONFIG_READER_NAMES = [
  ...NON_INTERACTIVE_CONFIG_READERS.map(({ name }) => name),
  "share",
] as const;

export const TERMINAL_CONFIG_READERS = ["init", "edit"] as const;

export type ConfigReaderName = (typeof CONFIG_READER_NAMES)[number];

export type ConfigReaderRun = { exitCode: number; output: string };

type NamedRun = ConfigReaderRun & { name: ConfigReaderName };

export type RunsOverABrokenConfig = {
  runs: NamedRun[];
  shareRequests: SeedConfigRequest[];
  terminal: Record<(typeof TERMINAL_CONFIG_READERS)[number], ConfigReaderRun>;
  doctor: CLIResult;
  treeBefore: Record<string, TreeSnapshotEntry>;
  treeAfter: Record<string, TreeSnapshotEntry>;
};

export type RunsOverReadableConfigs = {
  runs: NamedRun[];
  templateEjected: boolean;
  dashboardScreen: string;
  edit: ConfigReaderRun & { minted: string[] };
};

type Installation = { fakeHome: string; projectDir: string };

// Restores the as-installed tree, so a command that wrongly wrote over one shape cannot mask the next.
export async function setAsideInstallation(fakeHome: string): Promise<() => Promise<void>> {
  const aside = `${fakeHome}.as-installed`;
  await cp(fakeHome, aside, { recursive: true });
  return async () => {
    await rm(fakeHome, { recursive: true, force: true });
    await cp(aside, fakeHome, { recursive: true });
  };
}

// Sequential: each run reads state the previous one may have written.
async function runConfigReaders(
  { fakeHome, projectDir }: Installation,
  store: SeedConfigStore,
): Promise<{ runs: NamedRun[]; shareRequests: SeedConfigRequest[] }> {
  const project = { dir: projectDir, globalHome: fakeHome };
  const runs: NamedRun[] = [];
  for (const { name, args } of NON_INTERACTIVE_CONFIG_READERS) {
    const { exitCode, output } = await CLI.run([...args], project, { env: { HOME: fakeHome } });
    runs.push({ name, exitCode, output });
  }

  store.reset();
  const share = await runShare(store, project);
  const shareRequests = [...store.requests];
  store.reset();

  return {
    runs: [...runs, { name: "share", exitCode: share.exitCode, output: share.output }],
    shareRequests,
  };
}

// Only for runs that end on their own (a refusal); one that opens its dashboard times out here.
async function runToExitInTerminal(
  args: string[],
  { fakeHome, projectDir }: Installation,
  store: SeedConfigStore,
): Promise<ConfigReaderRun> {
  const prompt = new InteractivePrompt(args, projectDir, {
    env: { HOME: fakeHome, AGENTS_INC_API_URL: store.url },
  });
  try {
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, output: prompt.getRawOutput() };
  } finally {
    await prompt.destroy();
  }
}

// Nothing is restored afterwards; the caller decides what the next run starts from.
export async function runEveryReaderOverABrokenConfig(
  installation: Installation,
  brokenDir: string,
  body: string,
  store: SeedConfigStore,
): Promise<RunsOverABrokenConfig> {
  const { fakeHome, projectDir } = installation;
  await writeCorruptConfig(brokenDir, body);
  const treeBefore = await readTreeSnapshot(fakeHome);

  const { runs, shareRequests } = await runConfigReaders(installation, store);
  const init = await runToExitInTerminal(["init"], installation, store);
  const edit = await runToExitInTerminal(["edit"], installation, store);
  const doctor = await CLI.run(["doctor"], { dir: projectDir }, { env: { HOME: fakeHome } });

  const treeAfter = await readTreeSnapshot(fakeHome);
  return { runs, shareRequests, terminal: { init, edit }, doctor, treeBefore, treeAfter };
}

// `init` is cancelled at its dashboard so it writes nothing; `edit` without a TTY mints an id only.
export async function runEveryReaderOverReadableConfigs(
  installation: Installation,
  store: SeedConfigStore,
): Promise<RunsOverReadableConfigs> {
  const { fakeHome, projectDir } = installation;
  const { runs } = await runConfigReaders(installation, store);
  const templateEjected = await fileExists(getEjectedTemplatePath(projectDir));

  const dashboard = new InteractivePrompt(["init"], projectDir, { env: { HOME: fakeHome } });
  let dashboardScreen: string;
  try {
    await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_LOAD);
    dashboardScreen = dashboard.getScreen();
    await dashboard.ctrlC();
  } finally {
    await dashboard.destroy();
  }

  store.reset();
  const edit = await CLI.run(
    ["edit"],
    { dir: projectDir, globalHome: fakeHome },
    { env: { AGENTS_INC_API_URL: store.url } },
  );
  const minted = [...store.minted];
  store.reset();

  return {
    runs,
    templateEjected,
    dashboardScreen,
    edit: { exitCode: edit.exitCode, output: edit.output, minted },
  };
}

export function runOf(runs: readonly NamedRun[], name: ConfigReaderName): ConfigReaderRun {
  const run = runs.find((recorded) => recorded.name === name);
  if (!run) throw new Error(`no run of '${name}' was recorded`);
  return run;
}
