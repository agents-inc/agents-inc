import { describe, expect, it } from "vitest";
import { BUILT_IN_AGENT_GROUPS, BUILT_IN_AGENT_IDS, firstFocusableAgent } from "./agent-roster";
import { DOMAIN_AGENTS } from "../../stores/wizard-store";
import { AGENT_NAMES } from "../../types/generated/source-types";
import type { AgentName, Domain } from "../../types/index";
import { typedEntries, typedKeys, typedValues } from "../../utils/typed-object";

/**
 * The built-in agent roster is written down three times and only one of them is derived.
 * `AGENT_NAMES` is generated from each agent's `metadata.yaml`; the grid's
 * `BUILT_IN_AGENT_GROUPS` and the store's `DOMAIN_AGENTS` are written by hand.
 *
 * `tsc` reconciles them in one direction only. Deleting an agent directory takes its name out
 * of the `AgentName` union, so a stale entry fails to compile — three retirements once produced
 * 25 errors. ADDING one produces none, and six agents shipped in the package, documented, and
 * unreachable through the wizard because nothing asked the other question.
 *
 * So every assertion below is `toStrictEqual` against a list stated here. A count would say the
 * rosters changed and never which name moved, and it cannot see a swap at all.
 */

/**
 * The catalogue names the grid deliberately does not offer.
 *
 * `convention-keeper` is compiled and installed like any other sub-agent, but it is not
 * something a user picks a project's roster from — an installation brings it, not a domain
 * selection. Leaving it off the grid has to be a decision recorded here, which is the whole
 * point of the list: the alternative is that "unreachable through the wizard" happens by
 * default, silently, to whichever agent lands next.
 */
const AGENTS_WITH_NO_GRID_ROW: AgentName[] = ["convention-keeper"];

/**
 * The catalogue names no domain selection preselects.
 *
 * All four are meta agents whose value does not follow from a domain: the two summoners and the
 * documentation keeper are on the grid and chosen deliberately, and `convention-keeper` is not
 * offered at all (above). A domain-prefixed agent belongs here only with a reason, because a
 * domain that preselects two thirds of its roster is a defect that looks exactly like a
 * decision.
 */
const AGENTS_NO_DOMAIN_PRESELECTS: AgentName[] = [
  "agent-summoner",
  "codex-keeper",
  "convention-keeper",
  "skill-summoner",
];

/** The domains that bring a sub-agent roster with them when selected. */
const DOMAINS_WITH_A_PRESELECTION: Domain[] = ["web", "api", "cli", "ai"];

/** Every agent the grid offers, in the order it lists them. */
const gridRoster: AgentName[] = BUILT_IN_AGENT_GROUPS.flatMap((group) =>
  group.items.map((agent) => agent.id),
);

/** Every agent some domain preselects, deduplicated, in catalogue order. */
const preselectedByAnyDomain: AgentName[] = AGENT_NAMES.filter((name) =>
  typedValues(DOMAIN_AGENTS).some((roster) => roster.includes(name)),
);

/** The names a list repeats, in the order the repeats appear. */
function repeatedIn(names: readonly AgentName[]): AgentName[] {
  return names.filter((name, index) => names.indexOf(name) !== index);
}

describe("the wizard's agent rosters and the generated catalogue name the same agents", () => {
  it("offers a grid row for every agent the catalogue holds, bar the ones excused here", () => {
    expect(
      AGENT_NAMES.filter((name) => !BUILT_IN_AGENT_IDS.has(name)),
      "an agent the catalogue ships and the grid does not list cannot be selected, deselected or scoped by anyone",
    ).toStrictEqual(AGENTS_WITH_NO_GRID_ROW);
  });

  it("preselects every agent the catalogue holds from some domain, bar the ones excused here", () => {
    expect(
      AGENT_NAMES.filter((name) => !preselectedByAnyDomain.includes(name)),
      "an agent no domain brings is reachable only by hand, which is a choice rather than an omission",
    ).toStrictEqual(AGENTS_NO_DOMAIN_PRESELECTS);
  });

  it("preselects nothing the grid cannot then show, toggle or scope", () => {
    for (const [domain, roster] of typedEntries(DOMAIN_AGENTS)) {
      expect(
        roster.filter((name) => !BUILT_IN_AGENT_IDS.has(name)),
        `'${domain}' preselects an agent with no grid row, so the user is given one they cannot see or remove`,
      ).toStrictEqual([]);
    }
  });

  it("rosters exactly the domains listed here, each naming its agents once", () => {
    expect(
      typedKeys(DOMAIN_AGENTS),
      "a domain that gained or lost a sub-agent roster changes what a fresh selection installs",
    ).toStrictEqual(DOMAINS_WITH_A_PRESELECTION);

    for (const [domain, roster] of typedEntries(DOMAIN_AGENTS)) {
      expect(
        repeatedIn(roster),
        `'${domain}' rosters an agent twice, which the preselection union hides`,
      ).toStrictEqual([]);
    }
  });

  it("lists each agent once across the whole grid", () => {
    expect(
      repeatedIn(gridRoster),
      "an agent listed in two groups gets two rows the cursor lands on and one selection state",
    ).toStrictEqual([]);
  });

  it("opens on an agent the grid actually lists", () => {
    expect(
      gridRoster,
      "the store seeds focus from this roster before the first frame, so a name off the grid focuses nothing",
    ).toContain(firstFocusableAgent());
  });
});
