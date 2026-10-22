import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";

/**
 * A help page is the whole of what a user reads before running a command: its summary,
 * description, arguments, flags with their shorthands and defaults, and examples. Each page is
 * pinned whole, as printed at oclif's default width, so a changed word is a changed test. The
 * unit setup's worker runs on this machine, so the pages name the local editor.
 */
describe("each command's help page", () => {
  let cleanup: () => Promise<void>;

  // The oclif `init` hook reads the home config, so even `--help` needs an isolated home.
  beforeEach(async () => {
    ({ cleanup } = await setupIsolatedHome("cc-help-pages-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it("init says what it builds, what each flag does and how to start", async () => {
    const { stdout } = await runCliCommand(["init", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Initialize Agents Inc. in this project

      USAGE
        $ agents-inc init [-m <value>] [--from <id>] [--ui] [--provider
          <claude|codex>]

      FLAGS
        -m, --marketplace=<value>      With --from, install from this marketplace
                                       instead of the one the configuration names.
                                       Without --from, open the editor and say how to
                                       add it there
            --from=<id>                Install a configuration shared from
                                       agentsinc.sh by its id
            --provider=<claude|codex>  Which provider's installation this run is about
            --ui                       Open localhost:5173/editor on the id --from
                                       names, or on the catalogue — what a bare init
                                       does where nothing is installed

      DESCRIPTION
        Initialize Agents Inc. in this project

        Build a configuration in localhost:5173/editor, or install one by id with
        --from. Over an existing installation, shows its dashboard.

      EXAMPLES
        Open the editor to build a configuration

          $ agents-inc init

        Install a configuration built in the editor

          $ agents-inc init --from <id>

        Test local marketplace changes against a configuration built in the editor

          $ agents-inc init --from <id> --marketplace ./my-marketplace

      "
    `);
  });

  it("edit says what it opens, what each flag does and how to start", async () => {
    const { stdout } = await runCliCommand(["edit", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Open this installation in the editor, or apply a configuration with --from

      USAGE
        $ agents-inc edit [--ui] [--from <id>] [--provider
          <claude|codex>]

      FLAGS
        --from=<id>                Apply a configuration shared from agentsinc.sh by
                                   its id, removing whatever it leaves out — from a
                                   project, only the project's own entries
        --provider=<claude|codex>  Which provider's installation this run is about
        --ui                       Open localhost:5173/editor on this installation, or
                                   on the id --from names without applying it — what a
                                   bare edit does

      DESCRIPTION
        Open this installation in the editor, or apply a configuration with --from

        Open this installation in localhost:5173/editor, or apply a configuration
        built there with --from

      EXAMPLES
        Open this installation in the editor

          $ agents-inc edit

        Apply a configuration built in the editor, by its id

          $ agents-inc edit --from <id>

        Look at a shared configuration without applying it

          $ agents-inc edit --ui --from <id>

      "
    `);
  });

  it("compile says what it compiles and what its flags do", async () => {
    const { stdout } = await runCliCommand(["compile", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Compile agents using local skills and agent definitions

      USAGE
        $ agents-inc compile [-v] [--provider <claude|codex>]

      FLAGS
        -v, --verbose                  Enable verbose logging
            --provider=<claude|codex>  Which provider's installation this run is about

      DESCRIPTION
        Compile agents using local skills and agent definitions

        Compile agents with resolved skill references. Compiles to the Claude plugin
        directory.

      EXAMPLES
        $ agents-inc compile

        $ agents-inc compile --verbose

      "
    `);
  });

  it("doctor says what it checks", async () => {
    const { stdout } = await runCliCommand(["doctor", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Diagnose common configuration issues

      USAGE
        $ agents-inc doctor

      DESCRIPTION
        Diagnose common configuration issues

        Run diagnostic checks on your Agents Inc. configuration to identify issues
        with config validity, skill resolution, agent compilation, and marketplace
        connectivity.

      EXAMPLES
        $ agents-inc doctor

      "
    `);
  });

  it("eject names what it can copy and where", async () => {
    const { stdout } = await runCliCommand(["eject", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Eject skills, agent partials, or templates for local customization

      USAGE
        $ agents-inc eject [TYPE] [--provider <claude|codex>] [-f] [-o
          <value>]

      ARGUMENTS
        [TYPE]  (agent-partials|templates|skills|all) What to eject: agent-partials,
                templates, skills, all

      FLAGS
        -f, --force                    Overwrite existing files
        -o, --output=<value>           Write everything into this directory instead of
                                       each eject type's own destination
            --provider=<claude|codex>  Which provider's installation this run is about

      DESCRIPTION
        Eject skills, agent partials, or templates for local customization

        Copy agent partials, templates, or skills to your project for customization.
        Agent partials and templates are always copied from the CLI. Skills are copied
        from the marketplace this installation is configured to read (the public one
        by default).

      EXAMPLES
        Eject agent partials for customization

          $ agents-inc eject agent-partials

        Eject only agent templates

          $ agents-inc eject templates

        Eject skills to local directory

          $ agents-inc eject skills

        Eject everything with force overwrite

          $ agents-inc eject all --force

        Eject to a custom output directory

          $ agents-inc eject skills -o ./custom-dir

      "
    `);
  });

  it("list says what it shows and answers to ls", async () => {
    const { stdout } = await runCliCommand(["list", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Show installation information

      USAGE
        $ agents-inc list [--provider <claude|codex>]

      FLAGS
        --provider=<claude|codex>  Which provider's installation this run is about

      DESCRIPTION
        Show installation information

        Display details about the Agents Inc. installation (local or plugin mode)

      ALIASES
        $ agents-inc ls

      EXAMPLES
        Show current installation details

          $ agents-inc list

      "
    `);
  });

  it("search says what it matches a query against", async () => {
    const { stdout } = await runCliCommand(["search", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Search the catalog of available skills

      USAGE
        $ agents-inc search QUERY

      ARGUMENTS
        QUERY  Search query (matches id, displayName, slug, description, category)

      DESCRIPTION
        Search the catalog of available skills

        Read-only catalog browse. Searches the marketplace this installation reads
        from, plus the local skills already on disk, by id, displayName, slug,
        description, or category. To install one, add it in localhost:5173/editor.

      EXAMPLES
        Search for React skills

          $ agents-inc search react

        Search by any keyword (matches id, name, description, category)

          $ agents-inc search state

      "
    `);
  });

  it("share says what it publishes and how to pipe a configuration in", async () => {
    const { stdout } = await runCliCommand(["share", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Share this installation as an id anyone can install

      USAGE
        $ agents-inc share [--stdin] [--provider <claude|codex>]

      FLAGS
        --provider=<claude|codex>  Which provider's installation this run is about
        --stdin                    Share a configuration piped in on standard input
                                   instead of the one installed here

      DESCRIPTION
        Share this installation as an id anyone can install

        Turns the skills, sub-agents and per-agent curation installed here into a
        configuration the agentsinc.sh store holds, and prints the id it was given.
        Install it elsewhere with 'init --from <id>', or open it in the editor. The id
        is the configuration's own hash, so sharing an unchanged installation returns
        the id it already had.

      EXAMPLES
        $ agents-inc share

        cat proposal.json | agents-inc share --stdin

      "
    `);
  });

  it("uninstall says what it removes and what each flag keeps", async () => {
    const { stdout } = await runCliCommand(["uninstall", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Remove Agents Inc. from this project

      USAGE
        $ agents-inc uninstall [-y] [--provider <claude|codex>]

      FLAGS
        -y, --yes                      Skip confirmation prompt
            --provider=<claude|codex>  Which provider's installation this run is about

      DESCRIPTION
        Remove Agents Inc. from this project

        Uninstall Agents Inc. from this project. Removes CLI-managed skills (matched
        by marketplace), compiled agents, plugins, and the config manifest (config.ts
        + config-types.ts) this project keeps. User-created content is preserved.

      EXAMPLES
        $ agents-inc uninstall

        $ agents-inc uninstall --yes

      "
    `);
  });

  it("update says which marketplaces it refreshes", async () => {
    const { stdout } = await runCliCommand(["update", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Refresh the marketplaces this installation uses

      USAGE
        $ agents-inc update [--provider <claude|codex>]

      FLAGS
        --provider=<claude|codex>  Which provider's installation this run is about

      DESCRIPTION
        Refresh the marketplaces this installation uses

        Runs Claude's own marketplace update for every marketplace this installation's
        config names. Ejected skills are copies you own and are never touched.

      EXAMPLES
        $ agents-inc update

      "
    `);
  });

  it("build plugins names its directories, its default output and its examples", async () => {
    const { stdout } = await runCliCommand(["build", "plugins", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Build skills and agents into standalone plugins

      USAGE
        $ agents-inc build plugins [-a <value>] [-o <value>] [--skill <value>]
          [-v]

      FLAGS
        -a, --agents-dir=<value>  Agents source directory (builds one plugin per
                                  agent)
        -o, --output-dir=<value>  [default: dist/plugins] Output directory
        -v, --verbose             Enable verbose logging
            --skill=<value>       Compile only a specific skill (path to skill
                                  directory)

      DESCRIPTION
        Build skills and agents into standalone plugins

        Build skills and agents into standalone plugins. By default, compiles all
        skills. Use --skill to compile a specific skill only. Use --agents-dir to also
        compile agents.

      EXAMPLES
        Compile every skill into plugins

          $ agents-inc build plugins

        Compile a single skill by name

          $ agents-inc build plugins --skill cli-commander

        Write plugins to a custom output directory

          $ agents-inc build plugins --output-dir ./plugins

        Also compile agents from a directory

          $ agents-inc build plugins --agents-dir ./agents

        Compile with verbose logging

          $ agents-inc build plugins --verbose

      "
    `);
  });

  it("build marketplace names its inputs, its default output and its examples", async () => {
    const { stdout } = await runCliCommand(["build", "marketplace", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Generate marketplace.json from built plugins (requires skills repo)

      USAGE
        $ agents-inc build marketplace [--name <value>] [-p <value>] [-o <value>] [-v]

      FLAGS
        -o, --output=<value>       [default: .claude-plugin/marketplace.json] Output
                                   file
        -p, --plugins-dir=<value>  [default: dist/plugins] Plugins directory
        -v, --verbose              Enable verbose logging
            --name=<value>         Override the marketplace name (defaults to
                                   package.json 'name'). Must be kebab-case.

      DESCRIPTION
        Generate marketplace.json from built plugins (requires skills repo)

        Generate marketplace.json from built plugins. This command scans the plugins
        directory and generates a marketplace manifest file. Reads marketplace
        identity (name, version, description, author) from package.json in the current
        working directory. Use --name to override the marketplace name when
        package.json uses an npm scoped name (e.g. @scope/pkg), which is not a valid
        marketplace name.

      EXAMPLES
        Generate marketplace.json from the default plugins directory

          $ agents-inc build marketplace

        Generate marketplace.json from a custom plugins directory

          $ agents-inc build marketplace --plugins-dir dist/stacks

        Write marketplace.json to a custom output path

          $ agents-inc build marketplace --output .claude-plugin/market.json

        Override the marketplace name (use when package.json has an npm scoped name
        like @scope/pkg)

          $ agents-inc build marketplace --name my-marketplace

      "
    `);
  });

  it("new marketplace says what the scaffold holds and what the name becomes", async () => {
    const { stdout } = await runCliCommand(["new", "marketplace", "--help"]);

    expect(stdout).toMatchInlineSnapshot(`
      "Scaffold a marketplace of your own

      USAGE
        $ agents-inc new marketplace NAME

      ARGUMENTS
        NAME  Name of the marketplace (kebab-case). Becomes the directory, the
              package.json name, and the prefix every skill id must carry.

      DESCRIPTION
        Scaffold a marketplace of your own

        Create a directory holding everything the CLI needs to read a marketplace: a
        package.json carrying its identity, the three config files, and one example
        skill already named in the marketplace's own namespace. It scaffolds only —
        run 'build plugins' and 'build marketplace' to publish what you have written.

      EXAMPLES
        Scaffold a marketplace named acme into ./acme

          $ agents-inc new marketplace acme

      "
    `);
  });
});
