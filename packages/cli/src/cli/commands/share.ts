import { Flags } from "@oclif/core";

import { BaseCommand } from "../base-command.js";
import { isLocalSource } from "../lib/configuration/config.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { unofferablePlacementsFound } from "../lib/hosts/configured-placements.js";
import { seedPayloadForInstallation } from "../lib/seed/installation-payload.js";
import { publishSeedConfig } from "../lib/seed/publish-seed.js";
import {
  readPipedPayload,
  STDIN_IS_A_TERMINAL,
  type PipedPayload,
} from "../lib/seed/read-piped-payload.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { warn } from "../utils/logger.js";
import { readAllOf } from "../utils/read-stream.js";
import {
  sharedConfigDestinations,
  sharedIdNamesAFolder,
  sharedSkillsLeftBehind,
  shareRefusesEjectedSkills,
} from "../utils/messages.js";
import { typedEntries } from "../utils/typed-object.js";
import type { SkillId } from "../types/index.js";
import type { SeedPayload } from "@workspace/matrix/seed";

type ShareablePayload = { payload: SeedPayload; caveats: string[] };

/** What the id will not do everywhere — warned after the id rather than refused. */
function caveatsAbout(payload: SeedPayload, leftBehind: readonly SkillId[]): string[] {
  const { marketplace } = payload;
  return [
    ...(isAFolder(marketplace) ? [sharedIdNamesAFolder(marketplace)] : []),
    ...(leftBehind.length > 0 ? [sharedSkillsLeftBehind(leftBehind)] : []),
  ];
}

function isAFolder(marketplace: string | undefined): marketplace is string {
  return marketplace !== undefined && isLocalSource(marketplace);
}

function ejectedSkillsIn(payload: SeedPayload): string[] {
  return typedEntries(payload.skills)
    .filter(([, skill]) => skill.install === "eject")
    .map(([id]) => id);
}

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
    provider: providerFlag(),
  };

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "cat proposal.json | <%= config.bin %> <%= command.id %> --stdin",
  ];

  /** Everything that can fail locally fails before the POST: store writes are the scarce quota. */
  async run(): Promise<void> {
    const { flags } = await this.parse(Share);

    // A piped payload never reads this directory, so its state must not refuse it.
    if (!flags.stdin) {
      await refuseAnAmbiguousInstallation(
        process.cwd(),
        "share",
        providerNamedBy(flags.provider),
        (message) => this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
      );
      await this.ensureConfigReadable(process.cwd());
      await this.refuseUnofferablePlacements(process.cwd());
    }

    const { payload, caveats } = flags.stdin
      ? await this.payloadFromPipe()
      : await this.payloadFromInstallation();

    const published = await publishSeedConfig(payload);
    if (!published.ok) {
      this.error(published.error, { exit: EXIT_CODES.ERROR });
    }

    this.reportShared(published.id);
    // Not `this.warn`: oclif hard-wraps, which breaks the folder paths caveats name.
    for (const caveat of caveats) warn(caveat);
  }

  /** A placement the host cannot fill was never installed here, so the id would misdescribe it. */
  private async refuseUnofferablePlacements(cwd: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(cwd);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
  }

  private async payloadFromInstallation(): Promise<ShareablePayload> {
    const prepared = await seedPayloadForInstallation(process.cwd());
    if (!prepared.ok) {
      this.error(prepared.error, { exit: EXIT_CODES.ERROR });
    }

    this.refuseEjectedSkills(prepared.payload);
    this.log(`Sharing ${prepared.skills} skill(s) across ${prepared.agents} sub-agent(s)...`);

    return {
      payload: prepared.payload,
      caveats: caveatsAbout(prepared.payload, prepared.leftBehind),
    };
  }

  /** A share carries plugins only: an ejected skill is a local copy the user may have edited. */
  private refuseEjectedSkills(payload: SeedPayload): void {
    const ejected = ejectedSkillsIn(payload);
    if (ejected.length > 0) {
      this.error(shareRefusesEjectedSkills(ejected), { exit: EXIT_CODES.ERROR });
    }
  }

  /** The caller's configuration; no installation is read, so it owes no caveats. */
  private async payloadFromPipe(): Promise<ShareablePayload> {
    if (process.stdin.isTTY) {
      this.error(STDIN_IS_A_TERMINAL, { exit: EXIT_CODES.ERROR });
    }

    const read: PipedPayload = readPipedPayload(await readAllOf(process.stdin));
    if (!read.ok) {
      this.error(read.error, { exit: EXIT_CODES.ERROR });
    }

    return { payload: read.payload, caveats: [] };
  }

  private reportShared(id: string): void {
    this.logSuccess(`Shared as ${id}`);
    for (const destination of sharedConfigDestinations(id)) {
      this.log(destination);
    }
  }
}
