import { describe, expect, it } from "vitest";

import { NOTHING_PIPED, readPipedPayload, STDIN_IS_A_TERMINAL } from "./read-piped-payload.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";

import type { AgentName, SkillId } from "../../types/index.js";

/**
 * The local half of `share --stdin`, which is the half that decides whether a write is spent.
 *
 * Every refusal here happens before the POST, and the three are told apart deliberately: nothing
 * arrived, what arrived is not JSON, or it is JSON the contract will not take. A single "invalid
 * input" would leave the caller — often an agent that just produced the payload — guessing which
 * of its own steps went wrong.
 */
/**
 * Twelve unwritable pairs out of one payload — four skills across three sub-agents, which is the
 * SMALL end of what a repository scan emits. Constrained to the generated unions so a retired
 * skill or sub-agent reddens this line rather than exporting a type error somewhere downstream.
 */
const UNWRITABLE_AT_SCALE = {
  skills: [
    "web-framework-react",
    "web-testing-vitest",
    "api-framework-hono",
    "shared-security-auth-security",
  ] as const satisfies readonly SkillId[],
  agents: ["web-developer", "api-developer", "reviewer"] as const satisfies readonly AgentName[],
};

/**
 * Comfortably above a bounded refusal and comfortably below an unbounded one: naming all twelve
 * pairs runs past 1,800 characters, and naming four runs under 700.
 */
/** The escape pair a producer reaches this refusal with, on stdin rather than over the wire. */
const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

const BOUNDED_REFUSAL_CEILING = 1_000;

describe("reading a payload off a pipe", () => {
  it("accepts a payload the contract takes, and hands back the parsed value", () => {
    const payload = buildSeedPayload({ skills: { "web-framework-react": buildSeedSkill() } });

    const read = readPipedPayload(JSON.stringify(payload));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.payload).toStrictEqual(payload);
  });

  /**
   * THE REFUSAL THIS FILE EXISTS FOR, and the one it could not make until 2026-09-01.
   *
   * A project-scoped skill assigned to a sub-agent resting at global has nowhere to be written,
   * and the store refuses it — so the write is spent to be told so. The local gate read the BASE
   * schema, which does not carry that rule, so this was the one payload that passed here and
   * failed at the edge, arriving as a bare `HTTP 400`.
   *
   * The pair is easy to compose by accident rather than exotic: `agents` is sparse, an absent
   * entry rests on the shared default of `global`, so "assign a skill and say nothing else" is
   * already it. That is exactly what `meta-config-stack-detect` emitted for every run.
   */
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
    // The control for the elision below: one problem is named outright, never reported as the
    // clipped head of a longer list.
    expect(read.error, "a single problem must not carry an elision clause").not.toContain("(and ");
  });

  /** The same pair is writable the moment the sub-agent is pinned where the skill can reach it. */
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

  /** Whitespace is what a `printf ''` or a stray newline actually delivers. */
  it("refuses whitespace as emptiness rather than as malformed JSON", () => {
    expect(readPipedPayload("  \n\t ")).toStrictEqual({ ok: false, error: NOTHING_PIPED });
  });

  /**
   * The excerpt is the point of this one. A producer that piped a proposal REPORT instead of the
   * payload gets its own first words back, which names the mistake far better than a parser's
   * offset does.
   */
  it("quotes back what it read when the body is not JSON at all", () => {
    const read = readPipedPayload("here is what I found in your repo");

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("here is what I found in your repo");
    expect(read.error).not.toBe(NOTHING_PIPED);
  });

  /** Long bodies are clipped, or a refusal becomes the wall of text it is complaining about. */
  it("clips a long body rather than printing all of it back", () => {
    const read = readPipedPayload("x".repeat(500));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("…");
    expect(read.error.length).toBeLessThan(300);
  });

  /**
   * The sibling of the clip above, one refusal over — and the path where the wall of text is
   * really produced, because the scope rule raises one issue per (skill, sub-agent) PAIR rather
   * than one per payload. Every sentence is the same sentence with two names changed, so a
   * repository scan's 20-40 skills across 3-6 sub-agents refuses with hundreds of lines of it.
   *
   * Both halves are the contract. Naming the first pairs is what makes the refusal actionable at
   * all; saying how many were elided is what stops a caller who fixed the named ones from reading
   * a clipped list as a complete one and believing they are done.
   */
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
    // The first pair is named in full — both halves, so the producer knows what to change.
    expect(read.error).toContain("web-framework-react");
    expect(read.error).toContain("web-developer");
    // The last skill is past the bound and must not be named...
    expect(read.error).not.toContain("shared-security-auth-security");
    // ...but the caller is told it exists. Twelve pairs, four named.
    expect(read.error).toContain("(and 8 more)");
    expect(read.error.length).toBeLessThan(BOUNDED_REFUSAL_CEILING);
  });

  /**
   * Valid JSON the contract refuses is a DIFFERENT answer from invalid JSON, and this is the case
   * that separates them: a producer that hardcoded an older wire shape reaches exactly here.
   */
  it("names a refused key without the terminal escapes the producer put in it", () => {
    // The key travels into the issue PATH, which `formatZodIssue` renders. Whatever wrote this
    // payload chose the key, so it is the producer's string arriving on the CLI's own stdout.
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
    // The permitted case: a refusal that named no key at all would satisfy the spec above while
    // telling the producer nothing about which entry the store will reject.
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
    const read = readPipedPayload(JSON.stringify({ v: 5, skills: "not-a-record" }));

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error).toContain("not one this store accepts");
  });

  /** `v` is a `z.literal`, so a stale producer is refused on the version alone. */
  it("refuses a payload minted against a different wire version", () => {
    const stale = { ...buildSeedPayload(), v: 4 };

    expect(readPipedPayload(JSON.stringify(stale)).ok).toBe(false);
  });

  /**
   * The two refusals a caller can act on differently: one says pipe something in, the other says
   * stop typing. They must not be the same sentence, and nothing else asserts that they differ.
   */
  it("keeps the empty-pipe and terminal refusals distinct", () => {
    expect(NOTHING_PIPED).not.toBe(STDIN_IS_A_TERMINAL);
    expect(STDIN_IS_A_TERMINAL).toContain("terminal");
  });
});
