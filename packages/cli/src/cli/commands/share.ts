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

/** A payload to publish, and what is owed about it once it has an id. */
type ShareablePayload = { payload: SeedPayload; caveats: string[] };

/**
 * What an id minted from this installation will not do everywhere, said after the id rather than
 * refused: it still installs everything else.
 *
 * A payload names one marketplace, by the ref `--marketplace` took. A folder is a ref only this
 * machine can follow, and a plugin from any other marketplace is skipped wherever the id is
 * installed.
 */
function caveatsAbout(payload: SeedPayload, leftBehind: readonly SkillId[]): string[] {
  const { marketplace } = payload;
  return [
    ...(isAFolder(marketplace) ? [sharedIdNamesAFolder(marketplace)] : []),
    ...(leftBehind.length > 0 ? [sharedSkillsLeftBehind(leftBehind)] : []),
  ];
}

/** Whether a payload's marketplace ref is a folder on this machine rather than a repository. */
function isAFolder(marketplace: string | undefined): marketplace is string {
  return marketplace !== undefined && isLocalSource(marketplace);
}

/** The skills a payload asks the receiver to eject — local copies, editor-added ones included. */
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

  /**
   * Read, map, refuse, publish, then say what the id will not do everywhere.
   *
   * Everything that can fail locally fails before the POST. The store's free tier allows a
   * thousand writes a day and reads a hundred times that, so a write is the scarce half — and one
   * spent on a configuration that cannot be installed buys a dead link.
   *
   * The first three steps are `seedPayloadForInstallation`, shared with `edit --ui`: the two
   * commands mint the same id from the same directory and differ only in what they do with it.
   * The one refusal `edit --ui` does not share is of ejected skills — a share carries plugins
   * only, and the editor is where a user goes to turn ejected skills into plugins.
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(Share);

    // Only the installation path reads a directory. A piped payload is the CALLER's configuration
    // and no folder on this machine decides anything about it, so neither a scope holding two
    // installations nor a placement this host cannot fill is this run's problem — asking anyway
    // would refuse a `--stdin` share for the state of a directory it never opens.
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
    // Through `warn()` from `utils/logger.ts` rather than `this.warn`: oclif hard-wraps at the
    // terminal width, and a caveat names a folder path that does not survive being broken.
    for (const caveat of caveats) warn(caveat);
  }

  /**
   * Refuses a configuration asking for a mode/scope cell its own host does not offer, before the
   * payload is built and long before the POST.
   *
   * **`share` is a read path, and the roster that names them missed it.** The list this refusal
   * was built against reads "`compile`, `edit`, `update` and `doctor`" and claims to be every
   * command that acts on a configuration it did not just write — while `share` sits beside them
   * reading the same file through `seedPayloadForInstallation`. What it publishes is described as
   * "the skills, sub-agents and per-agent curation installed HERE", and a row the host could not
   * place was never installed here at all, so the id would describe an installation that does not
   * exist. `refuseAnAmbiguousInstallation` above is this finding's sibling and was already asked;
   * the two are the pair `doctor`'s Placements row reports together.
   *
   * A refusal rather than a row, like the other three writers, and for a reason of its own: the
   * store's write is the scarce half, and one spent on an installation nothing on this machine
   * will act on buys a link to a misdescription.
   *
   * `uninstall` reads the same file and is deliberately NOT on this roster: a refusal there would
   * make an unofferable installation unremovable, which is a guard that has swallowed its domain.
   */
  private async refuseUnofferablePlacements(cwd: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(cwd);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
  }

  /** The installation in this directory: mapped, refused if it holds ejected skills, announced. */
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

  /**
   * Refuses a share while anything it would send is an ejected (Local) skill.
   *
   * An ejected skill is a copy on this machine, which the user may have edited and an
   * editor-added skill always is, so a share carries plugins only — from a project, that covers
   * the ejected skills it inherits from the global installation as well as its own. A skill the
   * user wrote by hand is never in the payload, so it neither travels nor refuses.
   */
  private refuseEjectedSkills(payload: SeedPayload): void {
    const ejected = ejectedSkillsIn(payload);
    if (ejected.length > 0) {
      this.error(shareRefusesEjectedSkills(ejected), { exit: EXIT_CODES.ERROR });
    }
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
   *
   * It owes no caveats: those describe an installation, and none was read.
   */
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
