import { SEED_VERSION } from "@workspace/matrix/seed";
import { describe, expect, it } from "vitest";

import { NOTHING_PIPED, readPipedPayload, STDIN_IS_A_TERMINAL } from "./read-piped-payload.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";

import type { AgentName, SkillId } from "../../types/index.js";

/** Twelve unwritable pairs: the small end of what a repository scan emits. */
const UNWRITABLE_AT_SCALE = {
  skills: [
    "web-framework-react",
    "web-testing-vitest",
    "api-framework-hono",
    "shared-security-auth-security",
  ] as const satisfies readonly SkillId[],
  agents: ["web-developer", "api-developer", "reviewer"] as const satisfies readonly AgentName[],
};

const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

/** Naming all twelve pairs runs past 1,800 characters; naming four runs under 700. */
const BOUNDED_REFUSAL_CEILING = 1_000;

describe("reading a payload off a pipe", () => {
  it("accepts a payload the contract takes, and hands back the parsed value", () => {
    const payload = buildSeedPayload({ skills: { "web-framework-react": buildSeedSkill() } });

    const read = readPipedPayload(JSON.stringify(payload));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.payload).toStrictEqual(payload);
  });

  it("refuses a project skill assigned to a sub-agent resting at global, before any write", () => {
    const payload = buildSeedPayload({
      skills: {
        "web-framework-react": buildSeedSkill({
          scope: "project",
          assignments: { "web-developer": "lazy" },
        }),
      },
    });

    const read = readPipedPayload(JSON.stringify(payload));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("web-developer");
    expect(read.error).toContain("global scope");
    // Control for the elision below: one problem is named outright.
    expect(read.error, "a single problem must not carry an elision clause").not.toContain("(and ");
  });

  it("takes that same pair once the sub-agent is pinned to project", () => {
    const payload = buildSeedPayload({
      skills: {
        "web-framework-react": buildSeedSkill({
          scope: "project",
          assignments: { "web-developer": "lazy" },
        }),
      },
      agents: { "web-developer": { scope: "project" } },
    });

    expect(readPipedPayload(JSON.stringify(payload)).ok).toBe(true);
  });

  it("refuses an empty body by name, so an unconnected pipe is not a parse error", () => {
    expect(readPipedPayload("")).toStrictEqual({ ok: false, error: NOTHING_PIPED });
  });

  it("refuses whitespace as emptiness rather than as malformed JSON", () => {
    expect(readPipedPayload("  \n\t ")).toStrictEqual({ ok: false, error: NOTHING_PIPED });
  });

  /** A producer that piped a report instead of the payload gets its own first words back. */
  it("quotes back what it read when the body is not JSON at all", () => {
    const read = readPipedPayload("here is what I found in your repo");

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("here is what I found in your repo");
    expect(read.error).not.toBe(NOTHING_PIPED);
  });

  it("clips a long body rather than printing all of it back", () => {
    const read = readPipedPayload("x".repeat(500));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("…");
    expect(read.error.length).toBeLessThan(300);
  });

  it("names the first unwritable pairs and counts the rest rather than repeating one sentence", () => {
    const payload = buildSeedPayload({
      skills: Object.fromEntries(
        UNWRITABLE_AT_SCALE.skills.map((id) => [
          id,
          buildSeedSkill({
            scope: "project",
            assignments: Object.fromEntries(
              UNWRITABLE_AT_SCALE.agents.map((agent) => [agent, "lazy"]),
            ),
          }),
        ]),
      ),
    });

    const read = readPipedPayload(JSON.stringify(payload));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("web-framework-react");
    expect(read.error).toContain("web-developer");
    expect(read.error).not.toContain("shared-security-auth-security");
    // ...but counted: twelve pairs, four named.
    expect(read.error).toContain("(and 8 more)");
    expect(read.error.length).toBeLessThan(BOUNDED_REFUSAL_CEILING);
  });

  /** Valid JSON the contract refuses differs from invalid JSON; a stale producer lands here. */
  it("names a refused key without the terminal escapes the producer put in it", () => {
    // The key is the producer's string, rendered in the issue path on the CLI's own stdout.
    const read = readPipedPayload(
      JSON.stringify({
        v: 1,
        skills: { [`web-framework-react${ERASE_LINE}${CARRIAGE_RETURN}`]: 1 },
      }),
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).not.toContain(ESCAPE);
    expect(read.error).not.toContain(CARRIAGE_RETURN);
  });

  it("still names an honest refused key in full", () => {
    // The permitted case: a refusal naming no key would also pass the spec above.
    const read = readPipedPayload(JSON.stringify({ v: 1, skills: { "web-framework-react": 1 } }));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("web-framework-react");
  });

  it("quotes a non-JSON body back without the escapes inside it", () => {
    const read = readPipedPayload(`here is${ERASE_LINE}${CARRIAGE_RETURN} your repo`);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).not.toContain(ESCAPE);
    expect(read.error).not.toContain(CARRIAGE_RETURN);
    expect(read.error).toContain("here is your repo");
  });

  it("refuses JSON the payload contract does not accept, and says what was wrong", () => {
    const read = readPipedPayload(JSON.stringify({ v: SEED_VERSION, skills: "not-a-record" }));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("not one this store accepts");
  });

  it("refuses a payload minted against a different wire version", () => {
    const stale = { ...buildSeedPayload(), v: SEED_VERSION - 1 };

    expect(readPipedPayload(JSON.stringify(stale)).ok).toBe(false);
  });

  /** Pipe something in vs stop typing: nothing else asserts the two differ. */
  it("keeps the empty-pipe and terminal refusals distinct", () => {
    expect(NOTHING_PIPED).not.toBe(STDIN_IS_A_TERMINAL);
    expect(STDIN_IS_A_TERMINAL).toContain("terminal");
  });
});

describe("reading a payload off a pipe, word for word", () => {
  /** Exactly as many unwritable pairs as the refusal names, so none is left to count. */
  const FOUR_UNWRITABLE_PAIRS = buildSeedPayload({
    skills: Object.fromEntries(
      (["web-framework-react", "web-testing-vitest"] as const).map((id) => [
        id,
        buildSeedSkill({
          scope: "project",
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      ]),
    ),
  });

  const unwritable = (skill: string, agent: string) =>
    `skills.${skill}.assignments.${agent}: a project-scoped skill has nowhere to be written on '${agent}', which rests at global scope`;

  it("names exactly as many refused pairs as it lists, joined, with no count after them", () => {
    expect(readPipedPayload(JSON.stringify(FOUR_UNWRITABLE_PAIRS))).toStrictEqual({
      ok: false,
      error: `The configuration on standard input is not one this store accepts: ${[
        unwritable("web-framework-react", "web-developer"),
        unwritable("web-framework-react", "api-developer"),
        unwritable("web-testing-vitest", "web-developer"),
        unwritable("web-testing-vitest", "api-developer"),
      ].join("; ")}`,
    });
  });

  it("quotes back the opening of a non-JSON body without its surrounding blanks", () => {
    const read = readPipedPayload("  not json at all  ");

    expect(read.ok ? "" : read.error).toMatch(/\. It began: not json at all$/);
  });
});

describe("the empty-pipe refusal, as a person reads it", () => {
  // A literal: the existing specs compare against the exported constant, which moves with it.
  it("tells a person piping nothing how to pipe a configuration in", () => {
    expect(readPipedPayload("")).toStrictEqual({
      ok: false,
      error:
        "--stdin expects a configuration on standard input and none arrived. Pipe one in, as 'cat proposal.json | agents-inc share --stdin'.",
    });
  });
});
