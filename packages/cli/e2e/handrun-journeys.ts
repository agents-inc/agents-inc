/** Drives the real binary through journeys and prints a transcript; run node scripts/handrun.mjs */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import { matrixSchema } from "@workspace/matrix/matrix-schema";
import { attempt, note, section, verdict } from "./handrun-driver.js";
import { checkFourSurfaces } from "./handrun-surfaces.js";
import {
  startSeedConfigStore,
  runShare,
  runInitFrom,
  runEditUi,
  runEditFrom,
  type SeedConfigStore,
} from "./fixtures/seed-config-store.js";
import { createE2ESource, buildSharedE2ESourceInto } from "./helpers/create-e2e-source.js";
import { DECLARED_STOP_HOOK_LINE, declareAStopHook } from "./helpers/declared-stop-hook.js";
import { CLI, type CLIResult } from "./fixtures/cli.js";
import {
  readAgentEntries,
  readAllSkillEntries,
  readConfigSkillIds,
} from "./fixtures/dual-scope-helpers.js";
import { DUAL_SCOPE, e2eStackPayload } from "./fixtures/e2e-stack-seed.js";
import {
  createE2EPluginSource,
  buildPluginSourceInto,
} from "./helpers/create-e2e-plugin-source.js";
import {
  buildSharedSource,
  removeSharedSource,
} from "../src/cli/lib/__tests__/helpers/shared-source.js";
import { claudePluginMarketplaceAdd } from "../src/cli/lib/hosts/claude-host.js";
import {
  CLAUDE_SOURCE_REL,
  CODEX_SOURCE_REL,
  PROVIDER_CODEX,
  runInitFromOnCodex,
} from "./fixtures/codex-install.js";
import { installCodexOnPath } from "./fixtures/codex-on-path.js";
import { isCodexCLIAvailable, runCodex } from "./fixtures/codex.js";
import {
  codexDelegationScenario,
  everyRequestOf,
  mockProviderConfig,
  startCodexResponsesMock,
} from "./fixtures/codex-responses-mock.js";
import {
  acceptClaudeTrustPrompt,
  agentsPath,
  codexHome,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  listFiles,
  matchedAsWritten,
  readCompiledAgents,
  readMarketplaceJson,
  readTreeSnapshot,
  renderSkillMd,
  skillsPath,
  writeAgentFile,
  writeTestPackageJson,
} from "./helpers/test-utils.js";
import type { TreeSnapshotEntry } from "./helpers/test-utils.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../src/cli/lib/__tests__/factories/seed-factories.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "./fixtures/expected-values.js";
import {
  DIRS,
  E2E_MARKETPLACE_NAME,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
} from "./pages/constants.js";
import type { ProjectHandle } from "./fixtures/project-handle.js";
import type { SeedPayload } from "@workspace/matrix/seed";

function listDir(dir: string): string {
  if (!existsSync(dir)) return "(absent)";
  const entries = readdirSync(dir);
  return entries.length === 0 ? "(empty)" : entries.join(", ");
}

function skillIdsIn(configPath: string): string {
  if (!existsSync(configPath)) return "(no config)";
  const ids = [...readFileSync(configPath, "utf8").matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
  return ids.length === 0 ? "(none)" : ids.join(", ");
}

function mintedId(output: string): string | undefined {
  return /Shared as (\S+)/.exec(output)?.[1];
}

// Sorted: the config is a set of entries, so order is not part of the claim.
function canonicalEntries(values: readonly unknown[]): string {
  return values
    .map((value) => JSON.stringify(value))
    .sort()
    .join("\n");
}

// No metadata.yaml, so it cannot carry the `forkedFrom` stamp that would make it ours.
const FOREIGN_SKILL_DIR = "context7-mcp";

// Carries no provenance marker, so it is the user's own.
const FOREIGN_AGENT_NAME = "my-own-reviewer";

const CATALOGUE_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}catalogue`;

const CATALOGUE_SKILL_ID = `${CATALOGUE_MARKETPLACE_NAME}-example-skill`;
const CATALOGUE_STACK_ID = `${CATALOGUE_MARKETPLACE_NAME}-starter`;

function installSeed(
  store: SeedConfigStore,
  id: string,
  payload: SeedPayload,
  at: ProjectHandle,
  sourceDir: string,
): Promise<CLIResult> {
  store.publish(id, payload);
  return runInitFrom(store, id, at, sourceDir);
}

function installStackGlobally(
  store: SeedConfigStore,
  home: string,
  sourceDir: string,
): Promise<CLIResult> {
  return installSeed(
    store,
    "HandStack",
    e2eStackPayload(),
    { dir: home, globalHome: home },
    sourceDir,
  );
}

async function journeyGlobalInstall(
  store: SeedConfigStore,
): Promise<{ project: ProjectHandle; sourceDir: string }> {
  section("Journey 1 — global install from nothing");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j1-home-"));
  const run = await installStackGlobally(store, home, source.sourceDir);
  note(`exit ${run.exitCode}`);

  note("global config", skillIdsIn(configTsPath(home)));
  note("global skills", listDir(path.join(home, ".claude", "skills")));
  note("global agents", listDir(path.join(home, ".claude", "agents")));
  const surfaces = await checkFourSurfaces("global", home);
  verdict("journey 1 — all four surfaces hold at the global scope", surfaces.held);
  return { project: { dir: home, globalHome: home }, sourceDir: source.sourceDir };
}

// Minted by `edit --ui`: the install is ejected, which `share` refuses by design.
async function journeyRoundTrip(
  project: ProjectHandle,
  store: SeedConfigStore,
  sourceDir: string,
): Promise<string | undefined> {
  section("Journeys 23 / 30 — mint an id, install it, re-mint from the install");

  const shared = await runEditUi(store, project);
  const id = mintedId(shared.output);
  note(`edit --ui exit ${shared.exitCode}`, id ?? "(no id minted)");
  if (id === undefined) return undefined;

  const fresh = mkdtempSync(path.join(tmpdir(), "handrun-j30-"));
  try {
    const installed = await runInitFrom(store, id, { dir: fresh }, sourceDir);
    note(`init --from exit ${installed.exitCode}`);
    note("skills it installed", listDir(path.join(fresh, ".claude", "skills")));

    const ui = await runEditUi(store, { dir: fresh });
    const reminted = mintedId(ui.output);
    note(`edit --ui exit ${ui.exitCode}`, reminted ?? "(no id)");
    // Ids are content hashes; a global share and a project re-mint differ by scope alone.
    const posted = store.requests.filter((r) => r.method === "POST").map((r) => r.body);
    const scopes = (body: string): string =>
      [...new Set([...body.matchAll(/"scope":"([a-z]+)"/g)].map((m) => m[1]))].join("+") ||
      "(none)";
    note("scopes shared out", scopes(posted[0] ?? ""));
    note("scopes re-minted", scopes(posted[1] ?? ""));
    const landed = await checkFourSurfaces("installed-from-id", fresh);
    verdict("journeys 29 / 30 — the installed copy holds on all four surfaces", landed.held);
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
  return id;
}

async function journeyNonTtyRefusal(
  store: SeedConfigStore,
  id: string,
  sourceDir: string,
): Promise<void> {
  section("Journey 31 — edit --from refuses with no terminal to confirm at");
  const dir = mkdtempSync(path.join(tmpdir(), "handrun-j31-"));
  try {
    // Over an installation, or the nothing-installed refusal comes first.
    const installed = await runInitFrom(store, id, { dir }, sourceDir);
    note(`init --from exit ${installed.exitCode}`);
    const result = await runEditFrom(store, id, { dir });
    note(`exit ${result.exitCode}`);
    const line = result.output.split("\n").find((l) => l.includes("terminal"));
    note("what it said", line?.trim() ?? "(no mention of a terminal)");
    // The line too: any failure exits non-zero.
    verdict(
      "a destructive apply will not proceed unasked",
      result.exitCode !== 0 && line !== undefined,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function journeyPluginModeReal(store: SeedConfigStore): Promise<void> {
  section("Journeys 5 / 17 — plugin mode against a registered marketplace");
  const source = await createE2EPluginSource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-plugin-"));
  const configDir = path.join(home, ".claude");

  await claudePluginMarketplaceAdd(source.sourceDir, { configDir });
  note("registered with the real claude binary", source.marketplaceName);

  const result = await installSeed(
    store,
    "HandPlugin",
    e2eStackPayload({ install: "plugin" }),
    { dir: home, globalHome: home },
    source.sourceDir,
  );
  const said = result.output.split("\n").filter((line) => /Plugin|plugin|Installed/.test(line));
  note(`exit ${result.exitCode}`);
  note("what it said", said.slice(0, 3).join(" | ") || "(nothing about plugins)");
  note("plugin registry", listDir(path.join(configDir, "plugins")));
  const pluginSurfaces = await checkFourSurfaces("plugin-install", home);
  const registry = path.join(configDir, "plugins", "installed_plugins.json");
  const registered =
    existsSync(registry) && readFileSync(registry, "utf8").includes(source.marketplaceName);
  note("the registry names the marketplace", registered ? "yes" : "no");
  verdict(
    "journeys 5 / 17 — plugin mode installs and all four surfaces hold",
    pluginSurfaces.held && registered,
  );
}

async function journeyHomeScopeRefusal(store: SeedConfigStore, sourceDir: string): Promise<void> {
  section("Journey 32 — project-scoped content refused at $HOME");
  const posted = store.requests.filter((r) => r.method === "POST").map((r) => r.body);
  const original = posted[0];
  if (original === undefined) {
    note("SKIPPED — nothing was shared to rewrite");
    return;
  }
  const projectScoped = JSON.parse(
    original.replace(/"scope":\s*"global"/g, '"scope":"project"'),
  ) as unknown;
  store.publish("ProjScoped", projectScoped);

  const home = mkdtempSync(path.join(tmpdir(), "handrun-j32-"));
  const result = await runInitFrom(store, "ProjScoped", { dir: home, globalHome: home }, sourceDir);
  note(`exit ${result.exitCode}`);
  const line = result.output.split("\n").find((l) => l.includes("home directory"));
  note("what it said", line?.trim() ?? "(no mention of the home directory)");
  verdict(
    "a global install refuses project-scoped content",
    result.exitCode !== 0 && line !== undefined,
  );
  rmSync(home, { recursive: true, force: true });
}

async function journeyRefusesExistingInstall(
  store: SeedConfigStore,
  id: string,
  home: string,
  sourceDir: string,
): Promise<void> {
  section("Journey 13a — init --from refuses an install that already exists");
  const result = await runInitFrom(store, id, { dir: home, globalHome: home }, sourceDir);
  note(`exit ${result.exitCode}`);
  const line = result.output.split("\n").find((l) => /already exists|uninstall/.test(l));
  note("what it said", line?.trim() ?? "(no refusal found)");
  verdict("greenfield stays greenfield", result.exitCode !== 0 && line !== undefined);
}

const NO_MATCHING_LINE = "(not found)";

function firstLine(out: string, pattern: RegExp): string {
  return (
    out
      .split("\n")
      .find((l) => pattern.test(l))
      ?.trim() ?? NO_MATCHING_LINE
  );
}

async function journeyCommandsOverInstall(home: string): Promise<void> {
  section("Journeys 10 / 11 / 20 / 22 — commands over a live install");
  const at: ProjectHandle = { dir: home, globalHome: home };

  const doctor = await CLI.run(["doctor"], at);
  note(`doctor exit ${doctor.exitCode}`, firstLine(doctor.output, /Summary:/));

  const before = readFileSync(configTypesTsPath(home), "utf8");
  const compile = await CLI.run(["compile"], at);
  const after = readFileSync(configTypesTsPath(home), "utf8");
  note(`compile exit ${compile.exitCode}`);
  verdict("journey 11 — compile leaves config-types.ts byte-identical", before === after);

  const list = await CLI.run(["list"], at);
  note(`list exit ${list.exitCode}`, firstLine(list.output, /skill/i));

  const update = await CLI.run(["update"], at);
  note(`update exit ${update.exitCode}`, firstLine(update.output, /up to date|Updated|own/i));

  const eject = await CLI.run(["eject", "templates", "--force"], at);
  note(`eject templates exit ${eject.exitCode}`, firstLine(eject.output, /Ejected|template/i));

  const search = await CLI.run(["search", "react"], at);
  note(`search exit ${search.exitCode}`, firstLine(search.output, /react/i));
}

const DASHBOARD_TEXT_LINE = "  [Edit in the web editor]  [Compile]  [Doctor]  [List]";

// Own store: later journeys read the shared store's first post, and the bare `edit` posts one.
async function journeyFrontDoors(sourceDir: string): Promise<void> {
  section("Journeys 44 / 44a / 23 — a bare init and a bare edit, with no terminal");
  const store = await startSeedConfigStore();
  const root = mkdtempSync(path.join(tmpdir(), "handrun-j44-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  mkdirSync(home);
  mkdirSync(project);
  const at: ProjectHandle = { dir: project, globalHome: home };
  const unchanged = async (before: Record<string, TreeSnapshotEntry>): Promise<boolean> =>
    JSON.stringify(await readTreeSnapshot(root)) === JSON.stringify(before);
  try {
    const empty = await readTreeSnapshot(root);
    const bare = await CLI.run(["init"], at);
    note(`init exit ${bare.exitCode}`, firstLine(bare.stdout, /Build it at/));
    verdict(
      "journey 44 — a bare init where nothing is installed opens the editor and writes nothing",
      bare.exitCode === EXIT_CODES.SUCCESS &&
        bare.stdout.includes(`Build it at ${STEP_TEXT.EDITOR_URL}`) &&
        (await unchanged(empty)),
    );

    const local = await CLI.run(["init", "--marketplace", sourceDir], at);
    const remote = await CLI.run(["init", "--marketplace", "github:acme/skills"], at);
    note(
      `init --marketplace <folder> exit ${local.exitCode}`,
      firstLine(local.stdout, /Marketplace/),
    );
    note(
      `init --marketplace github:… exit ${remote.exitCode}`,
      firstLine(remote.stdout, /Marketplace/),
    );
    verdict(
      "journey 44 — --marketplace without --from opens the editor, saying a folder is pushed first and a remote ref is added as it is",
      local.exitCode === EXIT_CODES.SUCCESS &&
        remote.exitCode === EXIT_CODES.SUCCESS &&
        local.stdout.includes("push it to GitHub") &&
        remote.stdout.includes("Add github:acme/skills from the editor's Marketplace button.") &&
        (await unchanged(empty)),
    );

    const installed = await installSeed(
      store,
      "HandDoors",
      e2eStackPayload({ scope: "project" }),
      at,
      sourceDir,
    );
    note(`init --from exit ${installed.exitCode}`);
    const over = await readTreeSnapshot(root);

    const dashboard = await CLI.run(["init"], at);
    note(`init over the installation exit ${dashboard.exitCode}`);
    verdict(
      "journey 44a — over an installation a bare init prints its dashboard's four commands and changes nothing",
      dashboard.exitCode === EXIT_CODES.SUCCESS &&
        dashboard.stdout.includes(DASHBOARD_TEXT_LINE) &&
        (await unchanged(over)),
    );

    const edit = await CLI.run(["edit"], at, { env: { AGENTS_INC_API_URL: store.url } });
    const id = mintedId(edit.output);
    note(`edit exit ${edit.exitCode}`, id ?? "(no id minted)");
    verdict(
      "journey 23 — a bare edit mints an id for this installation, names the editor, and changes nothing",
      edit.exitCode === EXIT_CODES.SUCCESS &&
        id !== undefined &&
        store.minted.includes(id) &&
        edit.output.includes(STEP_TEXT.EDITOR_URL) &&
        (await unchanged(over)),
    );
  } finally {
    await store.close();
    rmSync(root, { recursive: true, force: true });
  }
}

async function journeyGlobalScopedPayload(
  store: SeedConfigStore,
  sourceDir: string,
): Promise<void> {
  section("Journeys 13 / 13b — init --from carrying global-scoped content");
  const posted = store.requests.filter((r) => r.method === "POST").map((r) => r.body);
  const original = posted[0];
  if (original === undefined) {
    note("SKIPPED — nothing was shared to rewrite");
    return;
  }
  store.publish("GlobalPay", JSON.parse(original) as unknown);
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j13b-"));
  try {
    const result = await runInitFrom(
      store,
      "GlobalPay",
      { dir: home, globalHome: home },
      sourceDir,
    );
    note(`exit ${result.exitCode}`, firstLine(result.output, /global|installed|Error/i));
    note("what landed", listDir(path.join(home, ".claude", "skills")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

async function journeyUninstall(store: SeedConfigStore): Promise<void> {
  section("Journey 19 — uninstall from scratch");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j19-"));
  await installStackGlobally(store, home, source.sourceDir);
  const before = listDir(path.join(home, ".claude", "skills"));

  const result = await CLI.run(["uninstall", "--yes"], { dir: home, globalHome: home });
  note(`exit ${result.exitCode}`, firstLine(result.output, /Removed|Uninstalled/i));
  note("skills before", before);
  note("skills after", listDir(path.join(home, ".claude", "skills")));
  const skillsGone = listDir(path.join(home, ".claude", "skills"));
  const configGone = !existsSync(configTsPath(home));
  const agentsGone = listDir(path.join(home, ".claude", "agents"));
  note("config.ts after", configGone ? "gone" : "still present");
  note("agents after", agentsGone);
  verdict(
    "journey 19 — uninstall leaves no config, no skills and no compiled agents",
    configGone && skillsGone === "(absent)" && agentsGone === "(absent)",
  );
  rmSync(home, { recursive: true, force: true });
}

async function journeyDeletedConfig(store: SeedConfigStore): Promise<void> {
  section("Journey 14 — the config deleted under a live install");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j14-"));
  await installStackGlobally(store, home, source.sourceDir);
  rmSync(configTsPath(home), { force: true });

  const at: ProjectHandle = { dir: home, globalHome: home };
  const doctor = await CLI.run(["doctor"], at);
  const doctorSaid = firstLine(doctor.output, /Orphan|no configuration/i);
  note(`doctor exit ${doctor.exitCode}`, doctorSaid);
  const list = await CLI.run(["list"], at);
  const listSaid = firstLine(list.output, /No |not found|install/i);
  note(`list exit ${list.exitCode}`, listSaid);
  // On what each SAID: a crash exits non-zero too.
  verdict(
    "the CLI reports rather than crashes",
    doctorSaid !== NO_MATCHING_LINE && listSaid !== NO_MATCHING_LINE,
  );
  rmSync(home, { recursive: true, force: true });
}

async function journeyNamespaceGuards(): Promise<void> {
  section("Journey 33 — an author's build refuses an id outside its namespace");
  const dir = mkdtempSync(path.join(tmpdir(), "handrun-j33-"));
  const at: ProjectHandle = { dir };
  const scaffold = await CLI.run(["new", "marketplace", "widgets"], at);
  note(`new marketplace exit ${scaffold.exitCode}`);

  const repo = path.join(dir, "widgets");
  const skillDir = path.join(repo, "src", "skills", "widgets-example-skill");
  const meta = path.join(skillDir, "metadata.yaml");
  if (existsSync(meta)) {
    const renamed = path.join(repo, "src", "skills", "not-ours-skill");
    cpSync(skillDir, renamed, { recursive: true });
    writeFileSync(
      path.join(renamed, "SKILL.md"),
      readFileSync(path.join(renamed, "SKILL.md"), "utf8").replace(
        /name:.*/,
        "name: not-ours-skill",
      ),
    );
    writeFileSync(
      path.join(renamed, "metadata.yaml"),
      readFileSync(path.join(renamed, "metadata.yaml"), "utf8").replace(
        /slug:.*/,
        "slug: not-ours-skill",
      ),
    );
  }
  note("skills in the repo", listDir(path.join(repo, "src", "skills")));
  await CLI.run(["build", "plugins"], { dir: repo });
  const build = await CLI.run(["build", "marketplace"], { dir: repo });
  const refusal = firstLine(build.output, /namespace|prefix|not-ours|Error/i);
  note(`build marketplace exit ${build.exitCode}`, refusal);
  verdict(
    "a build refuses an id outside its namespace",
    build.exitCode !== 0 && refusal !== NO_MATCHING_LINE,
  );
  rmSync(dir, { recursive: true, force: true });
}

async function journeyStackRoster(store: SeedConfigStore): Promise<void> {
  section("Journeys 2 / 12 — a stack installs exactly its roster");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j2-"));
  await installStackGlobally(store, home, source.sourceDir);
  const ids = await readConfigSkillIds(home);
  note("skills the stack installed", ids.join(", "));
  note("agents compiled", listDir(path.join(home, ".claude", "agents")));
  const types = configTypesTsPath(home);
  note("generated types", existsSync(types) ? "written" : "MISSING");
  const stacked = await checkFourSurfaces("stack-install", home);
  verdict(
    "journeys 2 / 12 — the stack's roster holds on all four surfaces",
    stacked.held && ids.length > 0 && existsSync(types),
  );
  rmSync(home, { recursive: true, force: true });
}

async function journeyProjectOverGlobal(store: SeedConfigStore): Promise<void> {
  section("Journeys 3 / 6 — a project over a global install, then a second project");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j3-home-"));
  const projA = mkdtempSync(path.join(tmpdir(), "handrun-j3-a-"));
  const projB = mkdtempSync(path.join(tmpdir(), "handrun-j3-b-"));

  await installStackGlobally(store, home, source.sourceDir);
  const globalIds = await readConfigSkillIds(home);
  note("global install", `${globalIds.length} skills`);

  const listA = await CLI.run(["list"], { dir: projA, globalHome: home });
  note(
    `list in an unregistered project exit ${listA.exitCode}`,
    firstLine(listA.output, /Skills|No install/i),
  );

  const doctorB = await CLI.run(["doctor"], { dir: projB, globalHome: home });
  note(
    `doctor in a second project exit ${doctorB.exitCode}`,
    firstLine(doctorB.output, /Summary:/),
  );
  const g = await checkFourSurfaces("global", home);
  const projectOwnsNothing = !existsSync(configTsPath(projA));
  note(
    "the unregistered project owns",
    projectOwnsNothing ? "nothing, correctly" : "a config of its own",
  );
  verdict(
    "journeys 3 / 6 — the global holds on all four and the project inherits without owning",
    g.held && projectOwnsNothing && listA.exitCode === 0,
  );
  for (const d of [home, projA, projB]) rmSync(d, { recursive: true, force: true });
}

async function journeyOwnershipBoundary(store: SeedConfigStore): Promise<void> {
  section("Journey 34 — a hand-authored skill is not the round trip's to carry or remove");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j34-"));
  await installStackGlobally(store, home, source.sourceDir);

  const mine = path.join(home, ".claude", "skills", "my-own-skill");
  mkdirSync(mine, { recursive: true });
  writeFileSync(path.join(mine, "SKILL.md"), renderSkillMd("my-own-skill", "mine", "Body."));
  writeFileSync(
    path.join(mine, "metadata.yaml"),
    'displayName: Mine\nslug: my-own-skill\ncategory: web-framework\ndomain: web\nusageGuidance: Mine.\nauthor: "@me"\ncustom: true\n',
  );

  const postsBefore = store.requests.filter((request) => request.method === "POST").length;
  // `edit --ui`, not `share`, which refuses an ejected install.
  const shared = await runEditUi(store, { dir: home, globalHome: home });
  // The posted payload, not the transcript, which never names a skill; no POST would make
  // "not carried" vacuous.
  const posted = store.requests.filter((request) => request.method === "POST").slice(postsBefore);
  const carried = posted.some((request) => request.body.includes(path.basename(mine)));
  note(`edit --ui exit ${shared.exitCode}`, `${posted.length} configuration(s) posted`);
  note("does the payload mention it?", carried ? "YES — it should not" : "no, correctly");
  note("still on disk", existsSync(mine) ? "yes" : "GONE");
  verdict(
    "a skill nobody installed is neither carried nor removed",
    posted.length > 0 && !carried && existsSync(mine),
  );
  rmSync(home, { recursive: true, force: true });
}

async function journeyPropagation(store: SeedConfigStore): Promise<void> {
  section("Journeys 7 / 8 — propagation, and containment");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j7-home-"));
  const proj = mkdtempSync(path.join(tmpdir(), "handrun-j7-proj-"));
  await installStackGlobally(store, home, source.sourceDir);
  await installSeed(
    store,
    "HandDual",
    e2eStackPayload(DUAL_SCOPE),
    { dir: proj, globalHome: home },
    source.sourceDir,
  );

  const globalTypes = readFileSync(configTypesTsPath(home), "utf8");
  const compile = await CLI.run(["compile"], { dir: proj, globalHome: home });
  note(`compile in the project exit ${compile.exitCode}`);
  const globalTypesAfter = readFileSync(configTypesTsPath(home), "utf8");
  verdict(
    "journey 8 — a project compile leaves the global pair untouched",
    globalTypes === globalTypesAfter,
  );

  const projects = readFileSync(configTsPath(home), "utf8");
  note(
    "the global config registers",
    /projects/.test(projects) ? "a projects list" : "no projects list",
  );
  for (const d of [home, proj]) rmSync(d, { recursive: true, force: true });
}

async function journeyExternalSkills(store: SeedConfigStore, sourceDir: string): Promise<void> {
  section("Journey 24 — init --from carrying an external skill's own bytes");
  const posted = store.requests.filter((r) => r.method === "POST").map((r) => r.body);
  const base = posted[0];
  if (base === undefined) {
    note("SKIPPED — nothing shared to build on");
    return;
  }
  const payload = JSON.parse(base) as Record<string, unknown>;
  payload.external = {
    "external-web-framework-handrun": buildSeedExternalSkill({
      displayName: "Handrun Skill",
      description: "Carried inline by the hand-run",
      categoryId: "web-framework",
      repo: "handrun/example",
      path: "skills/handrun",
      files: {
        "SKILL.md": renderSkillMd("external-web-framework-handrun", "Carried inline", "Body."),
        "reference/notes.md": "notes\n",
      },
    }),
  };
  const skills = payload.skills as Record<string, unknown>;
  skills["external-web-framework-handrun"] = buildSeedSkill({
    install: "eject",
    scope: "global",
    assignments: {},
  });
  store.publish("Carried", payload);

  const home = mkdtempSync(path.join(tmpdir(), "handrun-j24-"));
  try {
    const result = await runInitFrom(store, "Carried", { dir: home, globalHome: home }, sourceDir);
    note(`exit ${result.exitCode}`, firstLine(result.output, /carr|Wrote|Error|Skipped/i));
    const dir = path.join(home, ".claude", "skills", "external-web-framework-handrun");
    note("its directory", listDir(dir));
    const carriedSurfaces = await checkFourSurfaces("carried-install", home);
    verdict(
      "journey 24 — the carried directory lands AND all four surfaces hold",
      existsSync(path.join(dir, "reference", "notes.md")) && carriedSurfaces.held,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

async function journeyCustomMarketplaceArc(store: SeedConfigStore): Promise<void> {
  section("Journey 18 — a custom marketplace is stored and later commands resolve it");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j18-"));
  await installStackGlobally(store, home, source.sourceDir);

  const config = readFileSync(configTsPath(home), "utf8");
  const storesIt = config.includes(source.sourceDir);
  note("the config records the marketplace", storesIt ? "yes" : "no");

  const at: ProjectHandle = { dir: home, globalHome: home };
  const search = await CLI.run(["search", "react"], at);
  note(`search exit ${search.exitCode}`, firstLine(search.output, /react|found|No /i));
  const list = await CLI.run(["list"], at);
  note(`list exit ${list.exitCode}`, firstLine(list.output, /Skills|marketplace/i));
  verdict(
    "later commands answer from the stored marketplace, with no flag",
    search.exitCode === 0 && list.exitCode === 0,
  );
  rmSync(home, { recursive: true, force: true });
}

// doctor runs in the repository at both ends of the build and over the install: its answer must
// differ by cwd.
async function journeyMarketplaceAuthorArc(store: SeedConfigStore): Promise<void> {
  section("Journey 21 — the marketplace-author arc: doctor, build, publish, install");
  const source = await createE2ESource();
  const repo: ProjectHandle = { dir: source.sourceDir };

  const beforeBuild = await CLI.run(["doctor"], repo);
  note(
    `doctor over the repository exit ${beforeBuild.exitCode}`,
    firstLine(
      beforeBuild.output,
      new RegExp(matchedAsWritten(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION)),
    ),
  );

  const buildPlugins = await CLI.run(["build", "plugins"], repo);
  const compiled = (await listFiles(path.join(source.sourceDir, SOURCE_PATHS.PLUGINS_DIST))).sort();
  const shipped = [...E2E_SKILL_IDS].sort();
  note(`build plugins exit ${buildPlugins.exitCode}`, `${compiled.length} plugins compiled`);
  verdict(
    `journey 21 — build plugins compiles one plugin per skill the repository ships (${shipped.length})`,
    buildPlugins.exitCode === EXIT_CODES.SUCCESS && compiled.join(",") === shipped.join(","),
  );

  await writeTestPackageJson(source.sourceDir, { name: E2E_MARKETPLACE_NAME });
  const buildMarketplace = await CLI.run(["build", "marketplace"], repo);
  note(`build marketplace exit ${buildMarketplace.exitCode}`);
  const manifest = await readMarketplaceJson(
    path.join(source.sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
  );
  const published = manifest.plugins.map((plugin) => plugin.name).sort();
  note("the marketplace publishes", `${manifest.name}: ${published.length} plugins`);
  verdict(
    `journey 21 — the published marketplace lists those ${shipped.length} plugins and no others`,
    buildMarketplace.exitCode === EXIT_CODES.SUCCESS &&
      manifest.name === E2E_MARKETPLACE_NAME &&
      published.join(",") === shipped.join(","),
  );

  const afterBuild = await CLI.run(["doctor"], repo);
  note(`doctor over the built repository exit ${afterBuild.exitCode}`);

  const home = mkdtempSync(path.join(tmpdir(), "handrun-j21-"));
  try {
    const install = await installStackGlobally(store, home, source.sourceDir);
    note(`init from the built repository exit ${install.exitCode}`);
    note("skills it installed", listDir(skillsPath(home)));
    const installed = await checkFourSurfaces("author-arc-install", home);

    const overInstall = await CLI.run(["doctor"], { dir: home, globalHome: home });
    note(
      `doctor over the installation exit ${overInstall.exitCode}`,
      firstLine(
        overInstall.output,
        new RegExp(matchedAsWritten(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION)),
      ),
    );
    verdict(
      "journey 21 — doctor answers differently in the two cwds: the repository skips the operational layer at both ends of the build, the installation runs it",
      beforeBuild.exitCode === EXIT_CODES.SUCCESS &&
        beforeBuild.stdout.includes(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION) &&
        !beforeBuild.stdout.includes(STEP_TEXT.DOCTOR_CONFIG_CHECK) &&
        afterBuild.exitCode === EXIT_CODES.SUCCESS &&
        afterBuild.stdout.includes(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION) &&
        overInstall.exitCode === EXIT_CODES.SUCCESS &&
        overInstall.stdout.includes(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION) &&
        overInstall.stdout.includes(STEP_TEXT.DOCTOR_CONFIG_CHECK) &&
        !overInstall.stdout.includes(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION),
    );
    verdict(
      `journey 21 — the install from the built repository lands a roster (${installed.skillIds.length} skills) and holds on all four surfaces`,
      install.exitCode === EXIT_CODES.SUCCESS && installed.held && installed.skillIds.length > 0,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// Each end is also read at four-surface strength: two equally broken installs pass any comparison.
async function journeyShareRoundTrip(store: SeedConfigStore): Promise<void> {
  section("Journey 29 — share turns an installation into an id, and the id rebuilds it elsewhere");
  const source = await createE2ESource();
  const origin = mkdtempSync(path.join(tmpdir(), "handrun-j29-origin-"));
  const rebuilt = mkdtempSync(path.join(tmpdir(), "handrun-j29-rebuilt-"));
  try {
    const install = await installStackGlobally(store, origin, source.sourceDir);
    note(`the origin install exit ${install.exitCode}`);

    // The origin is ejected, which `share` refuses, so the id comes from `edit --ui`.
    const refused = await runShare(store, { dir: origin, globalHome: origin });
    note(`share exit ${refused.exitCode}`, firstLine(refused.output, /cannot be shared/));
    verdict(
      "journey 29 — share refuses an ejected origin, saying only plugins can be shared",
      refused.exitCode !== EXIT_CODES.SUCCESS &&
        refused.output.includes("Only plugins can be shared."),
    );
    const shared = await runEditUi(store, { dir: origin, globalHome: origin });
    const id = mintedId(shared.output);
    note(`edit --ui exit ${shared.exitCode}`, id ?? "(no id minted)");
    if (id === undefined) {
      verdict("journey 29 — edit --ui mints an id for a real installation", false);
      return;
    }

    const reinstalled = await runInitFrom(
      store,
      id,
      { dir: rebuilt, globalHome: rebuilt },
      source.sourceDir,
    );
    note(`init --from ${id} exit ${reinstalled.exitCode}`, firstLine(reinstalled.output, /Error/i));

    const originSkillEntries = await readAllSkillEntries(origin);
    const rebuiltSkillEntries = await readAllSkillEntries(rebuilt);
    const originAgentEntries = await readAgentEntries(origin);
    const rebuiltAgentEntries = await readAgentEntries(rebuilt);
    note(
      "config skill entries",
      `origin ${originSkillEntries.length}, rebuild ${rebuiltSkillEntries.length}`,
    );
    note(
      "config sub-agent entries",
      `origin ${originAgentEntries.length}, rebuild ${rebuiltAgentEntries.length}`,
    );
    verdict(
      `journey 29 — the rebuilt config carries the same ${originSkillEntries.length} skill entries and ${originAgentEntries.length} sub-agent entries, field for field`,
      originSkillEntries.length > 0 &&
        originAgentEntries.length > 0 &&
        canonicalEntries(originSkillEntries) === canonicalEntries(rebuiltSkillEntries) &&
        canonicalEntries(originAgentEntries) === canonicalEntries(rebuiltAgentEntries),
    );

    const originSkillDirs = (await listFiles(skillsPath(origin))).sort().join(", ");
    const rebuiltSkillDirs = (await listFiles(skillsPath(rebuilt))).sort().join(", ");
    note("origin skills directory", originSkillDirs || "(empty)");
    note("rebuilt skills directory", rebuiltSkillDirs || "(empty)");
    verdict(
      "journey 29 — the two skills directories hold the same skills",
      originSkillDirs.length > 0 && originSkillDirs === rebuiltSkillDirs,
    );

    const originAgentFiles = (await listFiles(agentsPath(origin))).sort().join(", ");
    const rebuiltAgentFiles = (await listFiles(agentsPath(rebuilt))).sort().join(", ");
    note("origin agents directory", originAgentFiles || "(empty)");
    note("rebuilt agents directory", rebuiltAgentFiles || "(empty)");
    verdict(
      "journey 29 — the two agents directories hold the same compiled sub-agents",
      originAgentFiles.length > 0 && originAgentFiles === rebuiltAgentFiles,
    );

    // Curation is read from the compiled bodies, where it is decided.
    const originBodies = await readCompiledAgents(origin);
    const rebuiltBodies = await readCompiledAgents(rebuilt);
    const curationDiffers = Object.keys(originBodies).filter(
      (file) => originBodies[file] !== rebuiltBodies[file],
    );
    note("compiled sub-agents whose body differs", curationDiffers.join(", ") || "none");
    verdict(
      `journey 29 — per-agent curation survives the trip: all ${Object.keys(originBodies).length} compiled sub-agents are byte-identical`,
      Object.keys(originBodies).length > 0 && curationDiffers.length === 0,
    );

    const originSurfaces = await checkFourSurfaces("share-origin", origin);
    const rebuiltSurfaces = await checkFourSurfaces("share-rebuild", rebuilt);
    verdict(
      "journey 29 — each end holds on all four surfaces in its own right, not merely against the other",
      originSurfaces.held && rebuiltSurfaces.held,
    );
  } finally {
    for (const d of [origin, rebuilt]) rmSync(d, { recursive: true, force: true });
  }
}

// Parsed with the editor's own schema: a catalogue the editor cannot read is no catalogue.
async function journeyCatalogueEmission(): Promise<void> {
  section("Journey 35 — build marketplace emits a catalogue beside the marketplace");
  const dir = mkdtempSync(path.join(tmpdir(), "handrun-j35-"));
  try {
    const scaffold = await CLI.run(["new", "marketplace", CATALOGUE_MARKETPLACE_NAME], { dir });
    note(`new marketplace exit ${scaffold.exitCode}`);

    const repo = path.join(dir, CATALOGUE_MARKETPLACE_NAME);
    const buildPlugins = await CLI.run(["build", "plugins"], { dir: repo });
    const buildMarketplace = await CLI.run(["build", "marketplace"], { dir: repo });
    note(`build plugins exit ${buildPlugins.exitCode}`);
    note(`build marketplace exit ${buildMarketplace.exitCode}`);

    const manifestDir = path.join(repo, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
    note("the manifest directory holds", listDir(manifestDir));
    const catalogPath = path.join(manifestDir, FILES.CATALOG_JSON);
    const beside =
      existsSync(catalogPath) && existsSync(path.join(manifestDir, FILES.MARKETPLACE_JSON));
    verdict(
      "journey 35 — a catalogue is emitted beside the marketplace, with no flag asking for one",
      buildMarketplace.exitCode === EXIT_CODES.SUCCESS && beside,
    );
    if (!beside) return;

    const parsed = matrixSchema.safeParse(JSON.parse(readFileSync(catalogPath, "utf8")));
    const issues = parsed.error?.issues ?? [];
    note(
      "schema issues",
      issues.length === 0 ? "none" : issues.map((issue) => issue.path.join(".")).join(", "),
    );
    const catalogueSkills = Object.keys(parsed.data?.skills ?? {}).sort();
    const catalogueStacks = (parsed.data?.suggestedStacks ?? []).map((stack) => stack.id).sort();
    note("catalogue skills", catalogueSkills.join(", ") || "(none)");
    note("catalogue stacks", catalogueStacks.join(", ") || "(none)");
    verdict(
      "journey 35 — the catalogue parses under the editor's own schema and carries this marketplace's one skill and one stack, and nothing else",
      issues.length === 0 &&
        catalogueSkills.join(",") === CATALOGUE_SKILL_ID &&
        catalogueStacks.join(",") === CATALOGUE_STACK_ID,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// doctor and uninstall must agree on what this install owns in a shared directory.
async function journeySharedDirectoryOwnership(store: SeedConfigStore): Promise<void> {
  section("Journey 36 — doctor steps over what it cannot claim, and uninstall refuses the same");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j36-"));
  try {
    const install = await installStackGlobally(store, home, source.sourceDir);
    note(`init exit ${install.exitCode}`);

    await createLocalSkill(home, FOREIGN_SKILL_DIR);
    await writeAgentFile(home, FOREIGN_AGENT_NAME, { frontmatter: true });

    const ourSkills = (await listFiles(skillsPath(home))).filter(
      (name) => name !== FOREIGN_SKILL_DIR,
    );
    const ourAgents = (await listFiles(agentsPath(home))).filter(
      (file) => file !== `${FOREIGN_AGENT_NAME}.md`,
    );
    note("skill directories this install wrote", `${ourSkills.length}: ${ourSkills.join(", ")}`);
    note("agent files it compiled", `${ourAgents.length}: ${ourAgents.join(", ")}`);
    note("what it shares the tree with", `${FOREIGN_SKILL_DIR}, ${FOREIGN_AGENT_NAME}.md`);

    const at: ProjectHandle = { dir: home, globalHome: home };
    const doctor = await CLI.run(["doctor"], at);
    note(
      `doctor exit ${doctor.exitCode}`,
      firstLine(doctor.output, new RegExp(matchedAsWritten(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR))),
    );
    note("does it name the neighbour?", doctor.stdout.includes(FOREIGN_SKILL_DIR) ? "yes" : "no");
    verdict(
      "journey 36 — doctor names the directory it cannot claim and declines to judge it, rather than failing over it",
      doctor.exitCode === EXIT_CODES.SUCCESS &&
        doctor.stdout.includes(FOREIGN_SKILL_DIR) &&
        doctor.stdout.includes(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR),
    );

    const uninstall = await CLI.run(["uninstall", "--yes"], at);
    const skillsLeft = await listFiles(skillsPath(home));
    const agentsLeft = await listFiles(agentsPath(home));
    note(
      `uninstall exit ${uninstall.exitCode}`,
      firstLine(
        uninstall.output,
        new RegExp(matchedAsWritten(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE)),
      ),
    );
    note("skill directories left", skillsLeft.join(", ") || "(none)");
    note("agent files left", agentsLeft.join(", ") || "(none)");
    verdict(
      `journey 36 — uninstall removed the ${ourSkills.length} skill directories and ${ourAgents.length} agent files this install owns, and left exactly the two it does not`,
      uninstall.exitCode === EXIT_CODES.SUCCESS &&
        ourSkills.length > 0 &&
        ourAgents.length > 0 &&
        skillsLeft.join(",") === FOREIGN_SKILL_DIR &&
        agentsLeft.join(",") === `${FOREIGN_AGENT_NAME}.md`,
    );
    verdict(
      "journey 36 — the two commands agree: the neighbour doctor stepped over is the one uninstall kept, and it says which files it kept and why",
      doctor.stdout.includes(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR) &&
        skillsLeft.join(",") === FOREIGN_SKILL_DIR &&
        uninstall.output.includes(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE) &&
        uninstall.output.includes(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const WEB_DEVELOPER = "web-developer";

// Mirrored, not imported from `agentCodec("codex").extension`, so a change reddens here.
const CODEX_ROLE_EXTENSION = ".toml";

// Its text decides nothing; the mock scenario does.
const CODEX_ANY_PROMPT = "make the change";

const CODEX_PROJECT_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [WEB_DEVELOPER]: "lazy" },
    }),
  },
  agents: { [WEB_DEVELOPER]: { on: true, scope: "project" } },
});

// HOME and project side by side: Codex needs them kept apart.
function codexScratch(label: string): { root: string; home: string; project: string } {
  const root = mkdtempSync(path.join(tmpdir(), `handrun-${label}-`));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  return { root, home, project };
}

const CODEX_UNINSTALL_IDS = { claude: "HandBothC", codex: "HandBothX" };

// Ejected so neither provider's install needs a host binary.
const GLOBAL_EJECT_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [WEB_DEVELOPER]: "lazy" },
    }),
  },
  agents: { [WEB_DEVELOPER]: { on: true, scope: "global" } },
});

// Config pair, ejected skills, compiled agents; content and mtime, so an identical rewrite shows.
async function claudeTreeUnder(home: string): Promise<Record<string, TreeSnapshotEntry>> {
  const trees = await Promise.all(
    [
      path.join(home, CLAUDE_SOURCE_REL),
      path.join(home, DIRS.CLAUDE, DIRS.SKILLS),
      path.join(home, DIRS.CLAUDE, DIRS.AGENTS),
    ].map(async (dir) => {
      const snapshot = await readTreeSnapshot(dir);
      return Object.entries(snapshot).map(
        ([file, entry]) => [path.join(dir, file), entry] as const,
      );
    }),
  );
  return Object.fromEntries(trees.flat());
}

// The refusal must name a flag that then works; neither half means anything alone.
async function journeyCodexUninstallLeavesClaude(
  store: SeedConfigStore,
  sourceDir: string,
): Promise<void> {
  section("Journeys 64 / 66 / 67 — a Codex uninstall leaves Claude untouched");

  const home = mkdtempSync(path.join(tmpdir(), "handrun-both-providers-"));
  try {
    const at: ProjectHandle = { dir: home, globalHome: home };
    store.publish(CODEX_UNINSTALL_IDS.claude, GLOBAL_EJECT_PAYLOAD);
    store.publish(CODEX_UNINSTALL_IDS.codex, GLOBAL_EJECT_PAYLOAD);

    const claude = await runInitFrom(store, CODEX_UNINSTALL_IDS.claude, at, sourceDir);
    const codex = await runInitFromOnCodex(store, CODEX_UNINSTALL_IDS.codex, at, sourceDir);
    note(
      `init --from (no flag) exit ${claude.exitCode}`,
      listDir(path.join(home, CLAUDE_SOURCE_REL)),
    );
    note(
      `init --from --provider codex exit ${codex.exitCode}`,
      listDir(path.join(home, CODEX_SOURCE_REL)),
    );

    const bothThere =
      existsSync(path.join(home, CLAUDE_SOURCE_REL, FILES.CONFIG_TS)) &&
      existsSync(path.join(home, CODEX_SOURCE_REL, FILES.CONFIG_TS));
    verdict(
      "journey 64 — one HOME now holds a Claude installation and a Codex one, which is the state the refusal is about",
      bothThere,
    );

    const refused = await CLI.run(["uninstall", "--yes"], at);
    note(`uninstall with no flag — exit ${refused.exitCode}`, firstLine(refused.output, /holds/));
    verdict(
      "journey 64 — uninstall refuses to guess which installation it is about, names --provider and both providers, and removes nothing",
      refused.exitCode === EXIT_CODES.INVALID_ARGS &&
        refused.output.includes("--provider") &&
        refused.output.includes(PROVIDER_CODEX[1]) &&
        existsSync(path.join(home, CODEX_SOURCE_REL, FILES.CONFIG_TS)),
    );

    const claudeBefore = await claudeTreeUnder(home);

    const removed = await CLI.run(["uninstall", "--yes", ...PROVIDER_CODEX], at);
    note(
      `uninstall --provider codex — exit ${removed.exitCode}`,
      firstLine(removed.output, /emov/),
    );
    note("the Codex folder after", listDir(path.join(home, CODEX_SOURCE_REL)));
    note("the Codex home after", listDir(codexHome(home)));
    note("the Claude folder after", listDir(path.join(home, CLAUDE_SOURCE_REL)));

    const claudeAfter = await claudeTreeUnder(home);
    // Two empty snapshots compare equal, so the count must be non-zero.
    const claudeFileCount = Object.keys(claudeBefore).length;
    note("Claude files snapshotted before the Codex uninstall", String(claudeFileCount));
    verdict(
      "journeys 66 / 67 — the flag removed the Codex installation and left every Claude file byte-identical and untouched",
      removed.exitCode === EXIT_CODES.SUCCESS &&
        !existsSync(path.join(home, CODEX_SOURCE_REL)) &&
        claudeFileCount > 0 &&
        JSON.stringify(claudeAfter) === JSON.stringify(claudeBefore),
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * Does what `e2e/global-setup.ts` does, since nothing outside vitest runs it: without the shared
 * tree plugin journeys die, and without the codex shim Codex journeys test this machine instead.
 */
async function withSharedFixtures(run: () => Promise<void>): Promise<void> {
  process.stdout.write("building the shared fixtures (plugin tree + plain tree)...\n");
  await installCodexOnPath();
  await buildSharedSource(async (root) => {
    await buildPluginSourceInto(root);
    await buildSharedE2ESourceInto(root);
  });

  try {
    await run();
  } finally {
    await removeSharedSource();
    process.stdout.write("shared fixtures removed\n");
  }
}

async function journeyCodexProjectInstallTrustsItself(
  store: SeedConfigStore,
  sourceDir: string,
): Promise<void> {
  section("Journeys 76 / 78 — a Codex project install trusts itself");

  const codexRan = await isCodexCLIAvailable();
  verdict("journey 76 — the pinned Codex binary this lane measures against starts", codexRan);
  if (!codexRan) return;

  const { root, home, project } = codexScratch("codex-trusts-itself");
  try {
    store.publish("HandCdxTrust", CODEX_PROJECT_PAYLOAD);
    const at: ProjectHandle = { dir: project, globalHome: home };
    const installed = await runInitFromOnCodex(store, "HandCdxTrust", at, sourceDir);
    note(
      `init --from HandCdxTrust --provider codex — exit ${installed.exitCode}`,
      firstLine(installed.output, /Error/i),
    );
    note("what it said about project trust", firstLine(installed.output, /Trusted this project/));

    const globalConfig = path.join(codexHome(home), "config.toml");
    const written = existsSync(globalConfig) ? readFileSync(globalConfig, "utf8") : "";
    const trustTables = written.split(`[projects."${project}"]`).length - 1;
    note("trust tables for this project in the global Codex config", String(trustTables));
    verdict(
      "journey 76 — the install trusted the project in the global Codex config, once, and said so",
      installed.exitCode === EXIT_CODES.SUCCESS &&
        installed.output.includes(STEP_TEXT.CODEX_PROJECT_TRUSTED) &&
        trustTables === 1,
    );

    const role = path.join(
      project,
      DIRS.CODEX,
      DIRS.AGENTS,
      `${WEB_DEVELOPER}${CODEX_ROLE_EXTENSION}`,
    );
    const roleText = existsSync(role) ? readFileSync(role, "utf8") : "";
    verdict(
      `journey 76 — ${WEB_DEVELOPER}'s role file exists and names no model, so Codex can start it`,
      roleText !== "" && !/^model\s*=/m.test(roleText),
    );

    const mock = await startCodexResponsesMock(codexDelegationScenario(WEB_DEVELOPER));
    try {
      const exec = await runCodex(
        home,
        ["exec", ...mockProviderConfig(mock), "--skip-git-repo-check", CODEX_ANY_PROMPT],
        project,
      );
      const wire = everyRequestOf(mock);
      note(`codex exec exit ${exec.exitCode}`, firstLine(exec.stderr, /./) || "(silent)");
      verdict(
        "journey 76 — with no trust written by hand, Codex offered the role and spawned it",
        wire.includes("spawn_agent") && wire.includes(WEB_DEVELOPER),
      );
    } finally {
      await mock.close();
    }

    const uninstalled = await CLI.run(["uninstall", "--yes"], at);
    note(
      `uninstall --yes — exit ${uninstalled.exitCode}`,
      firstLine(uninstalled.output, /agents/i),
    );
    note("role files left in .codex/agents", listDir(path.join(project, DIRS.CODEX, DIRS.AGENTS)));
    verdict("journey 78 — uninstall took the Codex role files away", !existsSync(role));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// A sub-agent at project scope, whose declared Stop hook needs a trusted folder.
const CLAUDE_PROJECT_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [WEB_DEVELOPER]: "lazy" },
    }),
  },
  agents: { [WEB_DEVELOPER]: { on: true, scope: "project" } },
});

// The control: from HOME the project agents dir IS `~/.claude/agents/`, which Claude trusts.
async function journeyClaudeFolderTrust(store: SeedConfigStore, sourceDir: string): Promise<void> {
  section("Journey 79 — a Claude project install says the folder must be trusted");

  await journeyClaudeHomeNeedsNoTrust(store, sourceDir);

  const { root, home, project } = codexScratch("claude-folder-trust");
  try {
    store.publish("HandClaTrust", CLAUDE_PROJECT_PAYLOAD);
    await declareAStopHook(project, WEB_DEVELOPER);
    const at: ProjectHandle = { dir: project, globalHome: home };
    const installed = await runInitFrom(store, "HandClaTrust", at, sourceDir);
    note(
      `init --from HandClaTrust — exit ${installed.exitCode}`,
      firstLine(installed.output, /trust the folder/),
    );
    verdict(
      "journey 79 — the install named the folder that has to be trusted",
      installed.output.includes(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED) &&
        installed.output.includes(project),
    );

    await acceptClaudeTrustPrompt(home, project);
    const recompiled = await CLI.run(["compile"], at);
    note(`compile, after the dialog was accepted — exit ${recompiled.exitCode}`, "");
    verdict(
      "journey 79 — once the folder is trusted, compile says nothing about it",
      recompiled.exitCode === EXIT_CODES.SUCCESS &&
        !recompiled.output.includes(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function journeyClaudeHomeNeedsNoTrust(
  store: SeedConfigStore,
  sourceDir: string,
): Promise<void> {
  const { root, home } = codexScratch("claude-home-trust");
  try {
    store.publish("HandClaHome", GLOBAL_EJECT_PAYLOAD);
    await declareAStopHook(home, WEB_DEVELOPER);
    const installed = await runInitFrom(
      store,
      "HandClaHome",
      { dir: home, globalHome: home },
      sourceDir,
    );
    note(
      `init --from HandClaHome, run from the home directory — exit ${installed.exitCode}`,
      firstLine(installed.output, /trust the folder/),
    );

    const compiled = (await readCompiledAgents(home))[`${WEB_DEVELOPER}.md`];
    verdict(
      `journey 79 — the global install from the home directory compiled ${WEB_DEVELOPER} with its declared Stop hook`,
      installed.exitCode === EXIT_CODES.SUCCESS &&
        compiled !== undefined &&
        compiled.includes(`\n${DECLARED_STOP_HOOK_LINE}\n`),
    );
    verdict(
      "journey 79 — and said nothing about trusting a folder, since its project agents ARE the global ones",
      !installed.output.includes(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const store = await startSeedConfigStore();
  try {
    const { project, sourceDir } = await journeyGlobalInstall(store);
    const id = await journeyRoundTrip(project, store, sourceDir);
    if (id !== undefined) {
      await journeyNonTtyRefusal(store, id, sourceDir);
      await journeyRefusesExistingInstall(store, id, project.globalHome ?? project.dir, sourceDir);
      await journeyHomeScopeRefusal(store, sourceDir);
    }
    await attempt("journeyFrontDoors", () => journeyFrontDoors(sourceDir));
    await attempt("journeyPluginModeReal", () => journeyPluginModeReal(store));
    await attempt("journeyCommandsOverInstall", () =>
      journeyCommandsOverInstall(project.globalHome ?? project.dir),
    );
    await attempt("journeyGlobalScopedPayload", () => journeyGlobalScopedPayload(store, sourceDir));
    await attempt("journeyUninstall", () => journeyUninstall(store));
    await attempt("journeyDeletedConfig", () => journeyDeletedConfig(store));
    await attempt("journeyNamespaceGuards", () => journeyNamespaceGuards());
    await attempt("journeyStackRoster", () => journeyStackRoster(store));
    await attempt("journeyProjectOverGlobal", () => journeyProjectOverGlobal(store));
    await attempt("journeyOwnershipBoundary", () => journeyOwnershipBoundary(store));
    await attempt("journeyPropagation", () => journeyPropagation(store));
    await attempt("journeyExternalSkills", () => journeyExternalSkills(store, sourceDir));
    await attempt("journeyCustomMarketplaceArc", () => journeyCustomMarketplaceArc(store));
    await attempt("journeyMarketplaceAuthorArc", () => journeyMarketplaceAuthorArc(store));
    await attempt("journeyShareRoundTrip", () => journeyShareRoundTrip(store));
    await attempt("journeyCatalogueEmission", () => journeyCatalogueEmission());
    await attempt("journeySharedDirectoryOwnership", () => journeySharedDirectoryOwnership(store));
    await attempt("journeyCodexUninstallLeavesClaude", () =>
      journeyCodexUninstallLeavesClaude(store, sourceDir),
    );
    await attempt("journeyCodexProjectInstallTrustsItself", () =>
      journeyCodexProjectInstallTrustsItself(store, sourceDir),
    );
    await attempt("journeyClaudeFolderTrust", () => journeyClaudeFolderTrust(store, sourceDir));
  } finally {
    await store.close();
    process.stdout.write("\nstore closed\n");
  }
}

await withSharedFixtures(main);
