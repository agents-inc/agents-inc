import { Flags } from "@oclif/core";

import { BaseCommand } from "../base-command.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { seedPayloadForInstallation } from "../lib/seed/installation-payload.js";
import { publishSeedConfig } from "../lib/seed/publish-seed.js";
import {
  readPipedPayload,
  STDIN_IS_A_TERMINAL,
  type PipedPayload,
} from "../lib/seed/read-piped-payload.js";
import { readAllOf } from "../utils/read-stream.js";
import { sharedConfigDestinations } from "../utils/messages.js";
import type { SeedPayload } from "@workspace/matrix/seed";

export default class Share extends BaseCommand {
  static summary = "Share this installation as an id anyone can install";

  static description =
    "Turns the skills, sub-agents and per-agent curation installed here into a configuration the agentsinc.sh store holds, and prints the id it was given. Install it elsewhere with 'init --from <id>', or open it in the editor. The id is the configuration's own hash, so sharing an unchanged installation returns the id it already had.";

  static flags = {
    stdin: Flags.boolean({
      description:
        "Share a configuration piped in on standard input instead of the one installed here",
      default: false,
    }),
  };

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "cat proposal.json | <%= config.bin %> <%= command.id %> --stdin",
  ];

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
    const { flags } = await this.parse(Share);

    const payload = flags.stdin
      ? await this.payloadFromPipe()
      : await this.payloadFromInstallation();

    const published = await publishSeedConfig(payload);
    if (!published.ok) {
      this.error(published.error, { exit: EXIT_CODES.ERROR });
    }

    this.reportShared(published.id);
  }

  /** The installation in this directory, mapped and announced. */
  private async payloadFromInstallation(): Promise<SeedPayload> {
    const prepared = await seedPayloadForInstallation(process.cwd());
    if (!prepared.ok) {
      this.error(prepared.error, { exit: EXIT_CODES.ERROR });
    }

    this.log(`Sharing ${prepared.skills} skill(s) across ${prepared.agents} sub-agent(s)...`);

    return prepared.payload;
  }

  /**
   * A configuration the CALLER holds, which is why nothing here reads an installation.
   *
   * That is the whole distinction the flag draws, and it is not cosmetic: a bare `share` resolves
   * an installation the way every other command does — this project, then the global one — so
   * without this branch, sharing a piped payload from a directory with nothing in it would
   * publish whatever the machine happens to have installed globally.
   *
   * The producer this exists for is not this CLI. `meta-config-stack-detect` walks a repository
   * and emits a `SeedPayload` it is forbidden to write or apply, and an id is the only door into
   * the editor, which reads `?fromId=` and nothing else. Publishing from here rather than from
   * the producer keeps `SEED_VERSION`, the `AGENTS_INC_API_URL` override and the caller's
   * user-agent in the one place that owns them.
   */
  private async payloadFromPipe(): Promise<SeedPayload> {
    if (process.stdin.isTTY) {
      this.error(STDIN_IS_A_TERMINAL, { exit: EXIT_CODES.ERROR });
    }

    const read: PipedPayload = readPipedPayload(await readAllOf(process.stdin));
    if (!read.ok) {
      this.error(read.error, { exit: EXIT_CODES.ERROR });
    }

    return read.payload;
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
