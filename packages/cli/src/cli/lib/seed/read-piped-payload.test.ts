import { describe, expect, it } from "vitest";

import { NOTHING_PIPED, readPipedPayload, STDIN_IS_A_TERMINAL } from "./read-piped-payload.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";

/**
 * The local half of `share --stdin`, which is the half that decides whether a write is spent.
 *
 * Every refusal here happens before the POST, and the three are told apart deliberately: nothing
 * arrived, what arrived is not JSON, or it is JSON the contract will not take. A single "invalid
 * input" would leave the caller — often an agent that just produced the payload — guessing which
 * of its own steps went wrong.
 */
describe("reading a payload off a pipe", () => {
  it("accepts a payload the contract takes, and hands back the parsed value", () => {
    const payload = buildSeedPayload({ skills: { "web-framework-react": buildSeedSkill() } });

    const read = readPipedPayload(JSON.stringify(payload));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.payload).toStrictEqual(payload);
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
   * Valid JSON the contract refuses is a DIFFERENT answer from invalid JSON, and this is the case
   * that separates them: a producer that hardcoded an older wire shape reaches exactly here.
   */
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
