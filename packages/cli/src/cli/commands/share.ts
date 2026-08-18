import { BaseCommand } from "../base-command.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { seedPayloadForInstallation } from "../lib/seed/installation-payload.js";
import { publishSeedConfig } from "../lib/seed/publish-seed.js";
import { sharedConfigDestinations } from "../utils/messages.js";

export default class Share extends BaseCommand {
  static summary = "Share this installation as an id anyone can install";

  static description =
    "Turns the skills, sub-agents and per-agent curation installed here into a configuration the agentsinc.sh store holds, and prints the id it was given. Install it elsewhere with 'init --from <id>', or open it in the editor. The id is the configuration's own hash, so sharing an unchanged installation returns the id it already had.";

  static flags = {};

  static examples = ["<%= config.bin %> <%= command.id %>"];

  /**
   * Read, map, refuse, publish.
   *
   * Everything that can fail locally fails before the POST. The store's free tier allows a
   * thousand writes a day and reads a hundred times that, so a write is the scarce half — and one
   * spent on a configuration that cannot be installed buys a dead link.
   *
   * The first three steps are `seedPayloadForInstallation`, shared with `edit --ui`: the two
   * commands mint the same id from the same directory and differ only in what they do with it.
   */
  async run(): Promise<void> {
    await this.parse(Share);

    const prepared = await seedPayloadForInstallation(process.cwd());
    if (!prepared.ok) {
      this.error(prepared.error, { exit: EXIT_CODES.ERROR });
    }

    this.log(`Sharing ${prepared.skills} skill(s) across ${prepared.agents} sub-agent(s)...`);

    const published = await publishSeedConfig(prepared.payload);
    if (!published.ok) {
      this.error(published.error, { exit: EXIT_CODES.ERROR });
    }

    this.reportShared(published.id);
  }

  /**
   * Both destinations, because an id nobody can act on is not a share and there are exactly two
   * things that read one: this CLI, and the editor the configuration can be reopened in. The
   * lines themselves are `sharedConfigDestinations`, shared with `edit --ui` for the same reason
   * the mint above is.
   */
  private reportShared(id: string): void {
    this.logSuccess(`Shared as ${id}`);
    for (const destination of sharedConfigDestinations(id)) {
      this.log(destination);
    }
  }
}
