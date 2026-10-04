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
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * Every command a user runs over an installation that reads its `config.ts`, driven the way the
 * user drives it — journey 38's subject, shared by the two specs that each break one of the two
 * configs a project reads.
 *
 * Two families, and the ruling treats them alike: the commands that WRITE (`compile`, `update`,
 * `eject`, `share`, and the two that take a terminal, `init` and `edit`) and the two that only
 * read (`search`, `list`). Over a config in play that exists and cannot be loaded, every one of
 * them refuses with the same message; with both configs readable, every one of them runs. `doctor`
 * and `uninstall` are the two that go on working over it, and each spec drives those itself,
 * because what they owe differs by which config is broken.
 */

/** A `config.ts` that is there and holds nothing — what `: > config.ts` leaves behind. */
export const EMPTY_CONFIG_FILE = "";

/**
 * The ways a `config.ts` can be there and unusable, each a file a user can be left holding.
 *
 * The schema-refused shape names the fixture marketplace beside its fault on purpose: it is the
 * one field a reader judging the file by its settings alone finds usable, so a command that reads
 * past the fault answers out of the fixture — recognisably, and without the network. Left without
 * one, that same command falls through to the public catalogue and fetches it.
 */
export const UNREADABLE_CONFIG_SHAPES = [
  { shape: "is empty", body: EMPTY_CONFIG_FILE },
  {
    shape: "names its marketplace beside a field the installation schema refuses",
    body: renderSchemaViolatingConfigTs(E2E_SOURCE.sourceDir),
  },
  { shape: "does not parse", body: renderUnparseableConfigTs() },
] as const;

/** The fixture skill a search asks for, so an answer out of the fixture marketplace is recognisable. */
const SEARCH_QUERY = E2E_SKILL.react.slug;

/** The commands that take no terminal, in the order {@link runConfigReaders} runs them. */
const NON_INTERACTIVE_CONFIG_READERS = [
  { name: "compile", args: ["compile"] },
  { name: "update", args: ["update"] },
  { name: "eject templates", args: ["eject", "templates"] },
  { name: "eject skills", args: ["eject", "skills"] },
  { name: "search", args: ["search", SEARCH_QUERY] },
  { name: "list", args: ["list"] },
] as const;

/** Every command {@link runConfigReaders} runs, by the name a spec reports it under. */
export const CONFIG_READER_NAMES = [
  ...NON_INTERACTIVE_CONFIG_READERS.map(({ name }) => name),
  "share",
] as const;

/** The two that take a terminal, which a refusal ends on its own and a readable config does not. */
export const TERMINAL_CONFIG_READERS = ["init", "edit"] as const;

export type ConfigReaderName = (typeof CONFIG_READER_NAMES)[number];

/** What one run left behind for a spec to assert on. */
export type ConfigReaderRun = { exitCode: number; output: string };

type NamedRun = ConfigReaderRun & { name: ConfigReaderName };

/** Everything every command did over one broken config, and the installation either side of it. */
export type RunsOverABrokenConfig = {
  runs: NamedRun[];
  shareRequests: SeedConfigRequest[];
  terminal: Record<(typeof TERMINAL_CONFIG_READERS)[number], ConfigReaderRun>;
  doctor: CLIResult;
  treeBefore: Record<string, TreeSnapshotEntry>;
  treeAfter: Record<string, TreeSnapshotEntry>;
};

/** Everything every command did over the same installation with both configs readable. */
export type RunsOverReadableConfigs = {
  runs: NamedRun[];
  templateEjected: boolean;
  dashboardScreen: string;
  editBuild: string;
};

/** The installation a spec built, as these runners need it. */
type Installation = { fakeHome: string; projectDir: string };

/**
 * Copies the installation aside once, and hands back what puts it back exactly as it was.
 *
 * Each broken shape is driven over the installation as the wizard left it, rather than as the
 * shape before it left it: a command that wrongly went ahead over one shape — `eject templates`
 * writing its templates — would otherwise leave the next shape's run nothing to write, and its
 * byte-identity check nothing to catch. The copy sits beside the home directory, inside the temp
 * tree the spec's own cleanup removes.
 */
export async function setAsideInstallation(fakeHome: string): Promise<() => Promise<void>> {
  const aside = `${fakeHome}.as-installed`;
  await cp(fakeHome, aside, { recursive: true });
  return async () => {
    await rm(fakeHome, { recursive: true, force: true });
    await cp(aside, fakeHome, { recursive: true });
  };
}

/**
 * Runs every non-interactive command once, in table order, then `share` against `store`.
 *
 * Sequential rather than concurrent: each is a run of the binary over the same installation, and
 * a write one command makes is state the next one reads.
 */
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

/**
 * Runs a command that takes a terminal in a real one, and waits for it to end.
 *
 * Only for a run expected to END on its own, which is what a refusal does: one that opened its
 * dashboard or wizard instead stops here at {@link TIMEOUTS.EXIT_WAIT}. The output is the raw
 * stream, so an error box oclif wrapped at the terminal's width reads back whole once flattened.
 */
async function runToExitInTerminal(
  args: string[],
  { fakeHome, projectDir }: Installation,
): Promise<ConfigReaderRun> {
  const prompt = new InteractivePrompt(args, projectDir, { env: { HOME: fakeHome } });
  try {
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, output: prompt.getRawOutput() };
  } finally {
    await prompt.destroy();
  }
}

/**
 * Writes `body` as the config in `brokenDir` — the project's own or the home directory's — and
 * runs every command from the project over it, `doctor` last, with the whole installation
 * snapshotted either side. Nothing is restored: the caller decides what the next run starts from.
 */
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
  const init = await runToExitInTerminal(["init"], installation);
  const edit = await runToExitInTerminal(["edit"], installation);
  const doctor = await CLI.run(["doctor"], { dir: projectDir }, { env: { HOME: fakeHome } });

  const treeAfter = await readTreeSnapshot(fakeHome);
  return { runs, shareRequests, terminal: { init, edit }, doctor, treeBefore, treeAfter };
}

/**
 * The same commands over an installation whose configs both load: the non-interactive ones run to
 * the end, `init` opens its dashboard and `edit` its wizard — each left by cancelling, so neither
 * writes — and whether `eject templates` put its templates down is read off the disk.
 */
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

  const edit = await EditWizard.launchInProject({ projectDir, globalHome: fakeHome });
  const editBuild = edit.build.getOutput();
  await edit.abortAndDestroy(TIMEOUTS.EXIT_WAIT);

  return { runs, templateEjected, dashboardScreen, editBuild };
}

/** The run recorded for `name` — a missing one is the spec's own bug, so it throws. */
export function runOf(runs: readonly NamedRun[], name: ConfigReaderName): ConfigReaderRun {
  const run = runs.find((recorded) => recorded.name === name);
  if (!run) throw new Error(`no run of '${name}' was recorded`);
  return run;
}
