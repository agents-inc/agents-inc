/**
 * The hand-run. Drives the real binary through journeys and prints a
 * transcript for a person to judge.
 *
 * Everything here is driven through the page objects and fixtures the E2E
 * suite already uses — `InitWizard` for the wizard, `seed-config-store` for
 * the `--from` seam. Nothing about waiting for screens or standing up a store
 * is reimplemented.
 *
 * Run from `packages/cli`:  node scripts/handrun.mjs
 */
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
import { createE2ESource } from "./helpers/create-e2e-source.js";
import { CLI } from "./fixtures/cli.js";
import {
  readAgentEntries,
  readAllSkillEntries,
  readConfigSkillIds,
  setupDualScopeWithEject,
  runEditWithFirstSkillAction,
} from "./fixtures/dual-scope-helpers.js";
import { createE2EPluginSource } from "./helpers/create-e2e-plugin-source.js";
import { claudePluginMarketplaceAdd } from "../src/cli/utils/exec.js";
import { InitWizard } from "./pages/wizards/init-wizard.js";
import { initGlobalWithEject } from "./fixtures/dual-scope-helpers.js";
import {
  agentsPath,
  completeWithLocalSources,
  createLocalSkill,
  listFiles,
  MONOREPO_ROOT,
  readCompiledAgents,
  readMarketplaceJson,
  skillsPath,
  writeAgentFile,
  writeTestPackageJson,
} from "./helpers/test-utils.js";
import {
  BUILT_IN_STACK_DISPLAY,
  E2E_SKILL,
  E2E_SKILL_IDS,
  E2E_STACK_DISPLAY,
} from "./fixtures/expected-values.js";
import {
  E2E_MARKETPLACE_NAME,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
  WIZARD_TAB_LABELS_WITHOUT_STACK,
  WIZARD_TAB_STACK,
} from "./pages/constants.js";
import type { ProjectHandle } from "./pages/wizard-result.js";

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

/**
 * A collection of config entries as one comparable string: every field of every
 * entry, serialised, then sorted so array order is not part of the claim.
 *
 * Order is deliberately excluded because the two sides of a round trip are
 * written by different producers — a wizard at one end, `init --from` at the
 * other — and the configuration is a set of entries rather than a sequence.
 * Everything else about an entry stays in.
 */
function canonicalEntries(values: readonly unknown[]): string {
  return values
    .map((value) => JSON.stringify(value))
    .sort()
    .join("\n");
}

/**
 * A directory in the shared `.claude/skills/` tree that this CLI did not put
 * there — it has no `metadata.yaml`, so nothing in it can carry the `forkedFrom`
 * stamp that would make it this installation's.
 */
const FOREIGN_SKILL_DIR = "context7-mcp";

/**
 * An agent file in the shared `.claude/agents/` tree that this CLI did not
 * compile. Its claim would be the provenance marker rather than `forkedFrom`,
 * and it carries none — which is the whole of what makes it the user's own.
 */
const FOREIGN_AGENT_NAME = "my-own-reviewer";

/** The marketplace journey 35 scaffolds, carrying the prefix the fixture sweep matches. */
const CATALOGUE_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}catalogue`;

/** The one skill and the one stack a scaffold ships, in that marketplace's own namespace. */
const CATALOGUE_SKILL_ID = `${CATALOGUE_MARKETPLACE_NAME}-example-skill`;
const CATALOGUE_STACK_ID = `${CATALOGUE_MARKETPLACE_NAME}-starter`;

/** Journey 1 — a global install from nothing, through the wizard. */
async function journeyGlobalInstall(): Promise<{ project: ProjectHandle; sourceDir: string }> {
  section("Journey 1 — global install from nothing, through the wizard");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j1-home-"));
  // Eject mode, because plugin mode needs a registered marketplace and the
  // fixture source is not one — the CLI refuses, correctly, and that refusal is
  // its own journey rather than this one.
  const run = await initGlobalWithEject(source.sourceDir, source.tempDir, home);
  note(`exit ${run.exitCode}`);

  note("global config", skillIdsIn(path.join(home, ".claude-src", "config.ts")));
  note("global skills", listDir(path.join(home, ".claude", "skills")));
  note("global agents", listDir(path.join(home, ".claude", "agents")));
  const surfaces = await checkFourSurfaces("global", home);
  verdict("journey 1 — all four surfaces hold at the global scope", surfaces.held);
  return { project: { dir: home, globalHome: home }, sourceDir: source.sourceDir };
}

/** Journeys 23 / 30 — share, install that id elsewhere, then re-mint from there. */
async function journeyRoundTrip(
  project: ProjectHandle,
  store: SeedConfigStore,
  sourceDir: string,
): Promise<string | undefined> {
  section("Journeys 23 / 30 — share, install the minted id, re-mint from the install");

  const shared = await runShare(store, project);
  const id = mintedId(shared.output);
  note(`share exit ${shared.exitCode}`, id ?? "(no id minted)");
  if (id === undefined) return undefined;

  const fresh = mkdtempSync(path.join(tmpdir(), "handrun-j30-"));
  try {
    const installed = await runInitFrom(store, id, { dir: fresh }, sourceDir);
    note(`init --from exit ${installed.exitCode}`);
    note("skills it installed", listDir(path.join(fresh, ".claude", "skills")));

    const ui = await runEditUi(store, { dir: fresh });
    const reminted = mintedId(ui.output);
    note(`edit --ui exit ${ui.exitCode}`, reminted ?? "(no id)");
    // Ids are content hashes, so they match only when the payload matches. The
    // share came from a GLOBAL install and the re-mint from a PROJECT one, so a
    // difference here is the scope field doing its job, not a lost round trip.
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

/** Journey 31 — the destructive apply refuses when nothing can answer the confirm. */
async function journeyNonTtyRefusal(store: SeedConfigStore, id: string): Promise<void> {
  section("Journey 31 — edit --from refuses with no terminal to confirm at");
  const dir = mkdtempSync(path.join(tmpdir(), "handrun-j31-"));
  try {
    const result = await runEditFrom(store, id, { dir });
    note(`exit ${result.exitCode}`);
    const line = result.output.split("\n").find((l) => l.includes("terminal"));
    note("what it said", line?.trim() ?? "(no mention of a terminal)");
    // The line, not only the exit code: a run that failed for any other reason exits
    // non-zero too, and this journey's claim is about WHAT was refused.
    verdict(
      "a destructive apply will not proceed unasked",
      result.exitCode !== 0 && line !== undefined,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Journeys 5 / 17 — plugin mode, against a marketplace the real `claude` knows. */
async function journeyPluginModeReal(): Promise<void> {
  section("Journeys 5 / 17 — plugin mode against a registered marketplace");
  const source = await createE2EPluginSource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-plugin-"));
  const configDir = path.join(home, ".claude");

  await claudePluginMarketplaceAdd(source.sourceDir, { configDir });
  note("registered with the real claude binary", source.marketplaceName);

  const wizard = await InitWizard.launch({
    source,
    projectDir: home,
    env: { HOME: home, CLAUDE_CONFIG_DIR: configDir },
  });
  const result = await wizard.completeWithDefaults();
  const said = result.output.split("\n").filter((line) => /Plugin|plugin|Installed/.test(line));
  note(`exit ${await result.exitCode}`);
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

/** Journey 32 — project-scoped content is refused at the home directory. */
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

/** Journey 13a — `init --from` refuses over an existing install. */
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

/** What {@link firstLine} answers when nothing in the output matched. */
const NO_MATCHING_LINE = "(not found)";

function firstLine(out: string, pattern: RegExp): string {
  return (
    out
      .split("\n")
      .find((l) => pattern.test(l))
      ?.trim() ?? NO_MATCHING_LINE
  );
}

/** Journeys 11 / 20 / 22 — the read-only and regeneration commands over a live install. */
async function journeyCommandsOverInstall(home: string): Promise<void> {
  section("Journeys 10 / 11 / 20 / 22 — commands over a live install");
  const at: ProjectHandle = { dir: home, globalHome: home };

  const doctor = await CLI.run(["doctor"], at);
  note(`doctor exit ${doctor.exitCode}`, firstLine(doctor.output, /Summary:/));

  const before = readFileSync(path.join(home, ".claude-src", "config-types.ts"), "utf8");
  const compile = await CLI.run(["compile"], at);
  const after = readFileSync(path.join(home, ".claude-src", "config-types.ts"), "utf8");
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

/** Journeys 13 / 13b — a shared configuration carrying global-scoped content. */
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

/** Journey 19 — uninstall from a real install, and what it declines to remove. */
async function journeyUninstall(): Promise<void> {
  section("Journey 19 — uninstall from scratch");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j19-"));
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);
  const before = listDir(path.join(home, ".claude", "skills"));

  const result = await CLI.run(["uninstall", "--yes"], { dir: home, globalHome: home });
  note(`exit ${result.exitCode}`, firstLine(result.output, /Removed|Uninstalled/i));
  note("skills before", before);
  note("skills after", listDir(path.join(home, ".claude", "skills")));
  const skillsGone = listDir(path.join(home, ".claude", "skills"));
  const configGone = !existsSync(path.join(home, ".claude-src", "config.ts"));
  const agentsGone = listDir(path.join(home, ".claude", "agents"));
  note("config.ts after", configGone ? "gone" : "still present");
  note("agents after", agentsGone);
  verdict(
    "journey 19 — uninstall leaves no config, no skills and no compiled agents",
    configGone && skillsGone === "(absent)" && agentsGone === "(absent)",
  );
  rmSync(home, { recursive: true, force: true });
}

/** Journey 14 — the config is deleted under a live install. */
async function journeyDeletedConfig(): Promise<void> {
  section("Journey 14 — the config deleted under a live install");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j14-"));
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);
  rmSync(path.join(home, ".claude-src", "config.ts"), { force: true });

  const at: ProjectHandle = { dir: home, globalHome: home };
  const doctor = await CLI.run(["doctor"], at);
  const doctorSaid = firstLine(doctor.output, /Orphan|no configuration/i);
  note(`doctor exit ${doctor.exitCode}`, doctorSaid);
  const list = await CLI.run(["list"], at);
  const listSaid = firstLine(list.output, /No |not found|install/i);
  note(`list exit ${list.exitCode}`, listSaid);
  // Both commands, and each on what it SAID. The disjunction this replaces was
  // satisfied by `doctor` merely exiting non-zero, which is also what the crash it
  // denies would do — so it could not tell a report from a crash.
  verdict(
    "the CLI reports rather than crashes",
    doctorSaid !== NO_MATCHING_LINE && listSaid !== NO_MATCHING_LINE,
  );
  rmSync(home, { recursive: true, force: true });
}

/** Journey 33 — the namespace guards. */
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

/** Journeys 2 / 12 — a stack installs exactly its own roster, and the pair type-checks. */
async function journeyStackRoster(): Promise<void> {
  section("Journeys 2 / 12 — a stack installs exactly its roster");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j2-"));
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);
  const ids = await readConfigSkillIds(home);
  note("skills the stack installed", ids.join(", "));
  note("agents compiled", listDir(path.join(home, ".claude", "agents")));
  const types = path.join(home, ".claude-src", "config-types.ts");
  note("generated types", existsSync(types) ? "written" : "MISSING");
  const stacked = await checkFourSurfaces("stack-install", home);
  verdict(
    "journeys 2 / 12 — the stack's roster holds on all four surfaces",
    stacked.held && ids.length > 0 && existsSync(types),
  );
  rmSync(home, { recursive: true, force: true });
}

/** Journeys 3 / 6 — a project over an existing global install, and a second project. */
async function journeyProjectOverGlobal(): Promise<void> {
  section("Journeys 3 / 6 — a project over a global install, then a second project");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j3-home-"));
  const projA = mkdtempSync(path.join(tmpdir(), "handrun-j3-a-"));
  const projB = mkdtempSync(path.join(tmpdir(), "handrun-j3-b-"));

  await initGlobalWithEject(source.sourceDir, source.tempDir, home);
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
  const projectOwnsNothing = !existsSync(path.join(projA, ".claude-src", "config.ts"));
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

/** Journey 34 — a hand-authored skill is outside the round trip and survives it. */
async function journeyOwnershipBoundary(store: SeedConfigStore): Promise<void> {
  section("Journey 34 — a hand-authored skill is not the round trip's to carry or remove");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j34-"));
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);

  const mine = path.join(home, ".claude", "skills", "my-own-skill");
  mkdirSync(mine, { recursive: true });
  writeFileSync(
    path.join(mine, "SKILL.md"),
    "---\nname: my-own-skill\ndescription: mine\n---\nBody.\n",
  );
  writeFileSync(
    path.join(mine, "metadata.yaml"),
    'displayName: Mine\nslug: my-own-skill\ncategory: web-framework\ndomain: web\nusageGuidance: Mine.\nauthor: "@me"\ncustom: true\n',
  );

  const postsBefore = store.requests.filter((request) => request.method === "POST").length;
  const shared = await CLI.run(
    ["share"],
    { dir: home, globalHome: home },
    { env: { AGENTS_INC_API_URL: store.url } },
  );
  // The PAYLOAD the store received, not the transcript: `share` prints a count and an
  // id and never names a skill, so a grep of its output for one is false whatever the
  // payload carried. `posted` is also the proof that a payload exists at all — with no
  // POST, "it does not mention the skill" is true of nothing.
  const posted = store.requests.filter((request) => request.method === "POST").slice(postsBefore);
  const carried = posted.some((request) => request.body.includes(path.basename(mine)));
  note(`share exit ${shared.exitCode}`, `${posted.length} configuration(s) posted`);
  note("does the payload mention it?", carried ? "YES — it should not" : "no, correctly");
  note("still on disk", existsSync(mine) ? "yes" : "GONE");
  verdict(
    "a skill nobody installed is neither carried nor removed",
    posted.length > 0 && !carried && existsSync(mine),
  );
  rmSync(home, { recursive: true, force: true });
}

/**
 * The public-catalogue checkout journey 28a reads.
 *
 * `SKILLS_SOURCE` first, then the sibling of the monorepo root — the same pair
 * `interactive/real-marketplace` and `interactive/edit-wizard-pending-removal-row` resolve, and
 * for the same reason: the skills repository is a separate checkout beside this one rather than
 * a workspace in it. This was one author's absolute path once, which meant the journey
 * skipped on every machine but that one while reporting the skip as an absent catalogue.
 */
const CATALOGUE_CHECKOUT = process.env.SKILLS_SOURCE ?? path.resolve(MONOREPO_ROOT, "../skills");

/** Journey 28a — a checkout of the public catalogue, read off a path, offers the built-in stacks. */
async function journeyCatalogueCheckout(): Promise<void> {
  section("Journey 28a — a public-catalogue checkout reaches the built-in stacks");
  // The skills DIRECTORY, not the checkout root: a stale or half-cloned checkout is a directory
  // that exists and carries no catalogue, and this journey would then fail as a wizard defect.
  if (!existsSync(path.join(CATALOGUE_CHECKOUT, SOURCE_PATHS.SKILLS_DIR))) {
    note("SKIPPED — no catalogue checkout on this machine", CATALOGUE_CHECKOUT);
    return;
  }
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j28a-"));
  const wizard = await InitWizard.launch({
    source: { sourceDir: CATALOGUE_CHECKOUT, tempDir: CATALOGUE_CHECKOUT },
    projectDir: home,
    env: { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude") },
  });
  try {
    await wizard.stack.waitForReady();
    const screen = wizard.getScreen();
    const offered = screen.split("\n").filter((l) => /^\s*[❯ ]\s*\S/.test(l)).length;
    note("stack screen offers", `${offered} lines of options`);
    note("a built-in name visible?", /stack|Stack|scratch/.test(screen) ? "yes" : "no");
    verdict("a catalogue checkout reaches the stack step", /Choose a stack/.test(screen));
  } finally {
    await wizard.destroy();
    rmSync(home, { recursive: true, force: true });
  }
}

/** Journeys 4 / 15 / 16 — scope toggles for a skill and a sub-agent, both directions. */
async function journeyScopeToggles(): Promise<void> {
  section("Journeys 4 / 15 / 16 — scope toggles, both directions");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j4-home-"));
  const proj = mkdtempSync(path.join(tmpdir(), "handrun-j4-proj-"));
  await setupDualScopeWithEject(source.sourceDir, source.tempDir, home, proj);

  const before = await readConfigSkillIds(proj);
  note("project skills before", before.slice(0, 3).join(", "));
  note("global skills", (await readConfigSkillIds(home)).slice(0, 3).join(", "));

  await runEditWithFirstSkillAction(proj, home, source.sourceDir, source.tempDir, "scope");
  const after = await readConfigSkillIds(proj);
  note("project skills after a scope toggle", after.slice(0, 3).join(", "));
  const gs = await checkFourSurfaces("global", home);
  const ps = await checkFourSurfaces("project", proj, { globalHome: home });
  const moved = before.join(",") !== after.join(",");
  note("did the project's roster change?", moved ? "yes" : "no");
  // `moved` is the subject guard: four-surface health at both scopes is satisfied by a
  // toggle that did nothing at all, which is the one outcome this journey denies.
  verdict(
    "journeys 4 / 15 / 16 — the scope toggle moved the project's roster and both scopes hold on all four surfaces",
    moved && gs.held && ps.held,
  );
  for (const d of [home, proj]) rmSync(d, { recursive: true, force: true });
}

/** Journeys 7 / 8 — a global edit propagates; a project edit stays contained. */
async function journeyPropagation(): Promise<void> {
  section("Journeys 7 / 8 — propagation, and containment");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j7-home-"));
  const proj = mkdtempSync(path.join(tmpdir(), "handrun-j7-proj-"));
  await setupDualScopeWithEject(source.sourceDir, source.tempDir, home, proj);

  const globalTypes = readFileSync(path.join(home, ".claude-src", "config-types.ts"), "utf8");
  const compile = await CLI.run(["compile"], { dir: proj, globalHome: home });
  note(`compile in the project exit ${compile.exitCode}`);
  const globalTypesAfter = readFileSync(path.join(home, ".claude-src", "config-types.ts"), "utf8");
  verdict(
    "journey 8 — a project compile leaves the global pair untouched",
    globalTypes === globalTypesAfter,
  );

  const projects = readFileSync(path.join(home, ".claude-src", "config.ts"), "utf8");
  note(
    "the global config registers",
    /projects/.test(projects) ? "a projects list" : "no projects list",
  );
  for (const d of [home, proj]) rmSync(d, { recursive: true, force: true });
}

/** Journey 24 — a payload carrying an external skill's own bytes installs it. */
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
    "external-web-framework-handrun": {
      displayName: "Handrun Skill",
      description: "Carried inline by the hand-run",
      categoryId: "web-framework",
      repo: "handrun/example",
      path: "skills/handrun",
      files: {
        "SKILL.md":
          "---\nname: external-web-framework-handrun\ndescription: Carried inline\n---\nBody.\n",
        "reference/notes.md": "notes\n",
      },
    },
  };
  const skills = payload.skills as Record<string, unknown>;
  skills["external-web-framework-handrun"] = {
    install: "eject",
    scope: "global",
    assignments: {},
  };
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

/** Journey 9 — a stack's picks are editable: deselect one of them. */
async function journeyStackPicksEditable(): Promise<void> {
  section("Journey 9 — a stack's picks are editable");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j9-home-"));
  // Edited at the home root, where the session owns every scope. From a PROJECT
  // a globally-installed skill cannot be deselected at all — that invariant is
  // journey 4's subject, and it would make this journey read as broken.
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);

  const before = await readConfigSkillIds(home);
  await runEditWithFirstSkillAction(home, home, source.sourceDir, source.tempDir, "space");
  const after = await readConfigSkillIds(home);
  note("skills before", `${before.length}`);
  note("skills after deselecting one", `${after.length}`);
  const edited = await checkFourSurfaces("after-deselect", home);
  verdict(
    "journey 9 — a pick comes out and all four surfaces still hold",
    after.length === before.length - 1 && edited.held,
  );
  rmSync(home, { recursive: true, force: true });
}

/** Journey 18 — the custom-marketplace arc: the source is stored and later commands resolve it. */
async function journeyCustomMarketplaceArc(): Promise<void> {
  section("Journey 18 — a custom marketplace is stored and later commands resolve it");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j18-"));
  await initGlobalWithEject(source.sourceDir, source.tempDir, home);

  const config = readFileSync(path.join(home, ".claude-src", "config.ts"), "utf8");
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

/**
 * Journey 21 — the marketplace-author arc: `doctor` over the repository, `build
 * plugins`, `build marketplace`, then an install from what was built.
 *
 * `doctor` runs three times on purpose. Twice in the repository, at either end of
 * the build, and once over the installation — it is the one command whose answer
 * must CHANGE between the two cwds, so the verdict names both directions rather
 * than only the one it happens to be standing in.
 */
async function journeyMarketplaceAuthorArc(): Promise<void> {
  section("Journey 21 — the marketplace-author arc: doctor, build, publish, install");
  const source = await createE2ESource();
  const repo: ProjectHandle = { dir: source.sourceDir };

  const beforeBuild = await CLI.run(["doctor"], repo);
  note(
    `doctor over the repository exit ${beforeBuild.exitCode}`,
    firstLine(beforeBuild.output, new RegExp(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION)),
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
    const install = await initGlobalWithEject(source.sourceDir, source.tempDir, home);
    note(`init from the built repository exit ${install.exitCode}`);
    note("skills it installed", listDir(skillsPath(home)));
    const installed = await checkFourSurfaces("author-arc-install", home);

    const overInstall = await CLI.run(["doctor"], { dir: home, globalHome: home });
    note(
      `doctor over the installation exit ${overInstall.exitCode}`,
      firstLine(overInstall.output, new RegExp(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION)),
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

/**
 * Journey 28 — a marketplace's stacks are its own. One that ships stacks makes
 * the wizard offer exactly those; one that ships none leaves the wizard no stack
 * step and no Stack tab. Both arms install, so both have four surfaces to read.
 *
 * Journey 28a — a checkout of the public catalogue read off a path — is the
 * separate leg above and is not repeated here.
 */
async function journeyMarketplaceStacks(): Promise<void> {
  section("Journey 28 — the wizard offers the marketplace's own stacks, or no stack step at all");

  const stacked = await createE2ESource();
  const stackedHome = mkdtempSync(path.join(tmpdir(), "handrun-j28-stacked-"));
  const stackedWizard = await InitWizard.launch({
    source: stacked,
    projectDir: stackedHome,
    env: { HOME: stackedHome },
  });
  try {
    const offered = stackedWizard.stack.getOutput();
    note(
      "the stack screen offers",
      offered.includes(E2E_STACK_DISPLAY) ? E2E_STACK_DISPLAY : "(not the source's own stack)",
    );
    note(
      "does it also offer a built-in?",
      offered.includes(BUILT_IN_STACK_DISPLAY) ? "YES — it should not" : "no, correctly",
    );
    verdict(
      "journey 28 — a marketplace shipping stacks offers its own, plus the scratch row, and none of the built-ins",
      offered.includes(E2E_STACK_DISPLAY) &&
        offered.includes(STEP_TEXT.START_FROM_SCRATCH) &&
        !offered.includes(BUILT_IN_STACK_DISPLAY),
    );

    const result = await completeWithLocalSources(stackedWizard);
    note(`init exit ${await result.exitCode}`);
    note("skills it installed", listDir(skillsPath(stackedHome)));
    const surfaces = await checkFourSurfaces("stacked-source", stackedHome);
    verdict(
      "journey 28 — the stacked source's install lands a roster and holds on all four surfaces",
      surfaces.held && surfaces.skillIds.length > 0,
    );
    await result.destroy();
  } finally {
    await stackedWizard.destroy();
    rmSync(stackedHome, { recursive: true, force: true });
  }

  const stackless = await createE2ESource({ withoutStacks: true });
  const stacklessHome = mkdtempSync(path.join(tmpdir(), "handrun-j28-stackless-"));
  const launched = await InitWizard.launchOnDomainsInProject({
    source: stackless,
    projectDir: stacklessHome,
    globalHome: stacklessHome,
  });
  try {
    // Read before the walk starts. Raw PTY output is append-only, so a stack step
    // that painted for one frame is still in it — but the confirm step's summary
    // panel prints a Stack row of its own, so an absence claimed after the walk
    // would be an absence of nothing.
    const raw = launched.wizard.getRawOutput();
    const otherTabs = WIZARD_TAB_LABELS_WITHOUT_STACK.filter((label) => raw.includes(label));
    note(
      "tabs painted",
      `${otherTabs.length} of ${WIZARD_TAB_LABELS_WITHOUT_STACK.length} non-stack tabs`,
    );
    note("a Stack tab?", raw.includes(WIZARD_TAB_STACK) ? "YES — it should not be there" : "no");
    verdict(
      `journey 28 — a marketplace shipping no stacks paints all ${WIZARD_TAB_LABELS_WITHOUT_STACK.length} other tabs, no Stack tab and no stack step`,
      raw.includes(STEP_TEXT.DOMAINS) &&
        otherTabs.length === WIZARD_TAB_LABELS_WITHOUT_STACK.length &&
        !raw.includes(WIZARD_TAB_STACK) &&
        !raw.includes(STEP_TEXT.STACK) &&
        !raw.includes(STEP_TEXT.START_FROM_SCRATCH) &&
        !raw.includes(BUILT_IN_STACK_DISPLAY),
    );

    // A stackless source preselects nothing — there is no stack to preselect FROM
    // — so the grid opens empty and the pick has to be made, or the install below
    // installs zero skills and every surface is satisfied by nothing happening.
    const build = await launched.domain.acceptDefaults();
    await build.selectSkill(E2E_SKILL.react.display);
    const sources = await build.passThroughAllDomains();
    await sources.waitForReady();
    await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("init");
    const result = await confirm.confirm();
    note(`stackless init exit ${await result.exitCode}`);
    note("skills it installed", listDir(skillsPath(stacklessHome)));
    const surfaces = await checkFourSurfaces("stackless-source", stacklessHome);
    verdict(
      "journey 28 — the stackless source installs the skill that was picked and holds on all four surfaces",
      surfaces.held && surfaces.skillIds.includes(E2E_SKILL.react.id),
    );
    await result.destroy();
  } finally {
    await launched.wizard.destroy();
    rmSync(stacklessHome, { recursive: true, force: true });
  }
}

/**
 * Journey 29 — the share round trip. A real installation becomes an id, and that
 * id installs into a second directory that has never seen any of it.
 *
 * All four things the journey names are compared between the two ends — config,
 * skills directory, agents directory and per-agent curation — and then each end
 * is read at four-surface strength in its own right, which an
 * origin-against-rebuild comparison cannot do: two equally broken installations
 * satisfy every comparison here.
 */
async function journeyShareRoundTrip(store: SeedConfigStore): Promise<void> {
  section("Journey 29 — share turns an installation into an id, and the id rebuilds it elsewhere");
  const source = await createE2ESource();
  const origin = mkdtempSync(path.join(tmpdir(), "handrun-j29-origin-"));
  const rebuilt = mkdtempSync(path.join(tmpdir(), "handrun-j29-rebuilt-"));
  try {
    const install = await initGlobalWithEject(source.sourceDir, source.tempDir, origin);
    note(`the origin install exit ${install.exitCode}`);

    const shared = await runShare(store, { dir: origin, globalHome: origin });
    const id = mintedId(shared.output);
    note(`share exit ${shared.exitCode}`, id ?? "(no id minted)");
    if (id === undefined) {
      verdict("journey 29 — share mints an id for a real installation", false);
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

    // Per-agent curation, read where it is decided rather than where it is
    // declared: which skills each sub-agent got, and which of them are preloaded,
    // is what the compiled body says.
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

/**
 * Journey 35 — `build marketplace` emits a catalogue the browser can run on:
 * `catalog.json` beside `marketplace.json`, carrying only what this marketplace
 * ships.
 *
 * The emission has no flag, so an absent catalogue cannot mean an author who
 * chose not to publish one — it can only mean a marketplace that is broken. The
 * file is parsed with the editor's own schema, no transform in between, because
 * a catalogue the editor cannot read is the same as no catalogue.
 */
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

/**
 * Journey 36 — what an installation owns in a directory it shares.
 *
 * `~/.claude/skills/` and `~/.claude/agents/` are Claude Code's directories, and
 * everything else that installs into them is a neighbour. Which entries are this
 * installation's is one question two commands ask, and the claim is that they
 * answer it identically — `doctor` recommends `uninstall`, so a directory the
 * first names and the second declines would be an offer that is never kept.
 *
 * Both halves are driven here, against the same tree: a neighbour's skill
 * directory carrying no `forkedFrom`, and a hand-written agent file carrying no
 * provenance marker, beside a real install of both kinds. Showing one half alone
 * proves nothing about the agreement, which is the whole claim.
 */
async function journeySharedDirectoryOwnership(): Promise<void> {
  section("Journey 36 — doctor steps over what it cannot claim, and uninstall refuses the same");
  const source = await createE2ESource();
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j36-"));
  try {
    const install = await initGlobalWithEject(source.sourceDir, source.tempDir, home);
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
      firstLine(doctor.output, new RegExp(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR)),
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
      firstLine(uninstall.output, new RegExp(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE)),
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

async function main(): Promise<void> {
  const store = await startSeedConfigStore();
  try {
    const { project, sourceDir } = await journeyGlobalInstall();
    const id = await journeyRoundTrip(project, store, sourceDir);
    if (id !== undefined) {
      await journeyNonTtyRefusal(store, id);
      await journeyRefusesExistingInstall(store, id, project.globalHome ?? project.dir, sourceDir);
      await journeyHomeScopeRefusal(store, sourceDir);
    }
    await attempt("journeyPluginModeReal", () => journeyPluginModeReal());
    await attempt("journeyCommandsOverInstall", () =>
      journeyCommandsOverInstall(project.globalHome ?? project.dir),
    );
    await attempt("journeyGlobalScopedPayload", () => journeyGlobalScopedPayload(store, sourceDir));
    await attempt("journeyUninstall", () => journeyUninstall());
    await attempt("journeyDeletedConfig", () => journeyDeletedConfig());
    await attempt("journeyNamespaceGuards", () => journeyNamespaceGuards());
    await attempt("journeyStackRoster", () => journeyStackRoster());
    await attempt("journeyProjectOverGlobal", () => journeyProjectOverGlobal());
    await attempt("journeyOwnershipBoundary", () => journeyOwnershipBoundary(store));
    await attempt("journeyCatalogueCheckout", () => journeyCatalogueCheckout());
    await attempt("journeyScopeToggles", () => journeyScopeToggles());
    await attempt("journeyPropagation", () => journeyPropagation());
    await attempt("journeyExternalSkills", () => journeyExternalSkills(store, sourceDir));
    await attempt("journeyStackPicksEditable", () => journeyStackPicksEditable());
    await attempt("journeyCustomMarketplaceArc", () => journeyCustomMarketplaceArc());
    await attempt("journeyMarketplaceAuthorArc", () => journeyMarketplaceAuthorArc());
    await attempt("journeyMarketplaceStacks", () => journeyMarketplaceStacks());
    await attempt("journeyShareRoundTrip", () => journeyShareRoundTrip(store));
    await attempt("journeyCatalogueEmission", () => journeyCatalogueEmission());
    await attempt("journeySharedDirectoryOwnership", () => journeySharedDirectoryOwnership());
  } finally {
    await store.close();
    process.stdout.write("\nstore closed\n");
  }
}

await main();
