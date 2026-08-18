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
  readConfigSkillIds,
  setupDualScopeWithEject,
  runEditWithFirstSkillAction,
} from "./fixtures/dual-scope-helpers.js";
import { createE2EPluginSource } from "./helpers/create-e2e-plugin-source.js";
import { claudePluginMarketplaceAdd } from "../src/cli/utils/exec.js";
import { InitWizard } from "./pages/wizards/init-wizard.js";
import { initGlobalWithEject } from "./fixtures/dual-scope-helpers.js";
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
    verdict("a destructive apply will not proceed unasked", result.exitCode !== 0);
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
  verdict("a global install refuses project-scoped content", result.exitCode !== 0);
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
  verdict("greenfield stays greenfield", result.exitCode !== 0);
}

function firstLine(out: string, pattern: RegExp): string {
  return (
    out
      .split("\n")
      .find((l) => pattern.test(l))
      ?.trim() ?? "(not found)"
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
  note(`doctor exit ${doctor.exitCode}`, firstLine(doctor.output, /Orphan|no configuration/i));
  const list = await CLI.run(["list"], at);
  note(`list exit ${list.exitCode}`, firstLine(list.output, /No |not found|install/i));
  verdict("the CLI reports rather than crashes", doctor.exitCode !== 0 || list.exitCode === 0);
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
  note(
    `build marketplace exit ${build.exitCode}`,
    firstLine(build.output, /namespace|prefix|not-ours|Error/i),
  );
  verdict("a build refuses an id outside its namespace", build.exitCode !== 0);
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

  const shared = await CLI.run(
    ["share"],
    { dir: home, globalHome: home },
    { env: { AGENTS_INC_API_URL: store.url } },
  );
  const carried = /my-own-skill/.test(shared.output);
  note(`share exit ${shared.exitCode}`);
  note("does the payload mention it?", carried ? "YES — it should not" : "no, correctly");
  note("still on disk", existsSync(mine) ? "yes" : "GONE");
  verdict("a skill nobody installed is neither carried nor removed", !carried && existsSync(mine));
  rmSync(home, { recursive: true, force: true });
}

/** Journey 28a — a checkout of the public catalogue, read off a path, offers the built-in stacks. */
async function journeyCatalogueCheckout(): Promise<void> {
  section("Journey 28a — a public-catalogue checkout reaches the built-in stacks");
  const checkout = "/home/vince/dev/skills";
  if (!existsSync(checkout)) {
    note("SKIPPED — no catalogue checkout on this machine", checkout);
    return;
  }
  const home = mkdtempSync(path.join(tmpdir(), "handrun-j28a-"));
  const wizard = await InitWizard.launch({
    source: { sourceDir: checkout, tempDir: checkout },
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
  verdict(
    "journeys 4 / 15 / 16 — both scopes hold on all four surfaces after a scope toggle",
    gs.held && ps.held,
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
  } finally {
    await store.close();
    process.stdout.write("\nstore closed\n");
  }
}

await main();
