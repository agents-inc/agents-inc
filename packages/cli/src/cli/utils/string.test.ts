import { describe, it, expect, vi } from "vitest";
import { bytewise, stripTerminalControls, truncateText } from "./string";

/**
 * A locale whose collation orders two ordinary kebab-case names against their code units, which
 * is the whole reason `bytewise` exists rather than `localeCompare`. Lithuanian places `y`
 * immediately after `i`, so it puts `mobile-styling` before `mobile-storage` where code units put
 * it after — and `localeCompare` called with no locale reads the process default, which Node
 * takes from LC_ALL/LANG.
 */
const DIVERGENT_COLLATION_LOCALE = "lt";

/** The pair that locale reverses, stated in code-unit order. */
const COLLATION_DIVERGENT_PAIR = { first: "mobile-storage", second: "mobile-styling" } as const;

describe("bytewise", () => {
  it("orders by code unit even when the process's default collation disagrees", () => {
    const lithuanian = new Intl.Collator(DIVERGENT_COLLATION_LOCALE);
    const { first, second } = COLLATION_DIVERGENT_PAIR;

    expect(Math.sign(lithuanian.compare(first, second))).toBe(1);

    // Stands in for a machine whose default collation is Lithuanian, which is the only thing
    // `localeCompare` with no locale argument consults.
    const defaultCollation = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, that: string) {
        return lithuanian.compare(String(this), that);
      });
    const collationInForce = Math.sign(first.localeCompare(second));
    const ordered = bytewise(first, second);
    defaultCollation.mockRestore();

    expect(
      collationInForce,
      "the stand-in must actually answer for the process default, or the spec below proves nothing",
    ).toBe(1);
    expect(ordered).toBe(-1);
  });

  it("reports the three comparator outcomes", () => {
    expect(bytewise("a", "b")).toBe(-1);
    expect(bytewise("b", "a")).toBe(1);
    expect(bytewise("a", "a")).toBe(0);
  });
});

/**
 * The sequence that made this a defect rather than a theory, quoted from the 503 body the
 * CLI-855 lane watched a real terminal obey: erase-line, then a carriage return, then a forged
 * prompt written over the words the CLI had just printed in its own voice.
 */
const ERASE_LINE = "\u001B[2K";
const CARRIAGE_RETURN = "\r";

/** That body, verbatim. Rendered raw it repaints its own line; rendered inert it is a sentence. */
const FORGED_REFUSAL = `Could not store${ERASE_LINE}this${CARRIAGE_RETURN} ›   STORE COMPROMISED config`;

/**
 * The same words with the terminal's ability to act on them removed, and NOT with the words
 * removed. A sanitiser's job is to stop a body painting the screen, not to decide what a store is
 * allowed to say — so the forgery survives as visibly ordinary text, which is the whole point.
 */
const FORGED_REFUSAL_INERT = "Could not storethis ›   STORE COMPROMISED config";

/** An operating-system command: window title, hyperlink, clipboard write. Terminated by BEL. */
const SET_WINDOW_TITLE = "\u001B]0;owned\u0007";

/** The same, terminated by ST (`ESC \`) rather than BEL — the other terminator a terminal takes. */
const SET_TITLE_ST = "\u001B]0;owned\u001B\\";

/** CSI introduced by the single 8-bit byte rather than by `ESC [`, which some terminals honour. */
const EIGHT_BIT_ERASE = "\u009B2K";

/** Cursor-up, the other half of a forgery: rewrite a line the CLI printed BEFORE this one. */
const CURSOR_UP = "\u001B[1A";

describe("stripTerminalControls", () => {
  it("renders the escape sequence that forged a store refusal as inert text", () => {
    expect(stripTerminalControls(FORGED_REFUSAL)).toBe(FORGED_REFUSAL_INERT);
  });

  it("keeps a newline, which a multi-line explanation is made of", () => {
    // The permitted case for the refusals above. Without it they are satisfied by a sanitiser
    // that strips everything, which mangles every honest body the store has ever sent.
    expect(stripTerminalControls("first line\nsecond line")).toBe("first line\nsecond line");
  });

  it("keeps a tab, and every printable character a description is written from", () => {
    const authored = "Zod\tschemas — type inference, refinements ‘transforms’ 100%";
    expect(stripTerminalControls(authored)).toBe(authored);
  });

  it("removes an operating-system command along with the payload it carries", () => {
    expect(stripTerminalControls(`before${SET_WINDOW_TITLE}after`)).toBe("beforeafter");
    expect(stripTerminalControls(`before${SET_TITLE_ST}after`)).toBe("beforeafter");
  });

  it("removes an unterminated operating-system command rather than leaving it open", () => {
    // A terminal reading this swallows everything after it waiting for a terminator that never
    // arrives, so leaving the tail behind would leave the tail invisible.
    expect(stripTerminalControls("before\u001B]0;never terminated")).toBe("before");
  });

  it("removes a cursor movement, the half of a forgery that rewrites an earlier line", () => {
    expect(stripTerminalControls(`${CURSOR_UP}overwritten`)).toBe("overwritten");
  });

  it("removes an eight-bit control introducer as well as the seven-bit one", () => {
    expect(stripTerminalControls(`before${EIGHT_BIT_ERASE}after`)).toBe("before2Kafter");
  });

  it("removes a sequence left incomplete, which is what a naive cut produces", () => {
    // `ESC [ 2` with no final byte. A terminal holds it open and consumes what follows as
    // parameters, so a fragment is not safer than the whole sequence — it is worse.
    expect(stripTerminalControls("before\u001B[2")).toBe("before");
  });

  it("removes a bare escape without eating the newline behind it", () => {
    expect(stripTerminalControls("before\u001B\nafter")).toBe("before\nafter");
  });

  it("removes the control bytes that are neither escape nor newline", () => {
    expect(stripTerminalControls("a\u0000b\u0008c\u007Fd\u000Be")).toBe("abcde");
  });
});

/** A budget small enough that the escape below straddles it under a bare character slice. */
const TIGHT_BUDGET = 6;

describe("truncateText", () => {
  it("leaves text within its budget alone", () => {
    expect(truncateText("short", TIGHT_BUDGET)).toBe("short");
  });

  it("elides text past its budget", () => {
    expect(truncateText("far too long to fit", TIGHT_BUDGET)).toBe("far t…");
  });

  it("strips before it measures, so the budget buys characters a reader can see", () => {
    // Six visible characters and an escape between them. Truncating first spends the budget on
    // bytes nobody can read and elides the words that carry the meaning.
    expect(truncateText(`abc${ERASE_LINE}def`, TIGHT_BUDGET)).toBe("abcdef");
  });

  it("never hands back a sequence its own cut left half-finished", () => {
    const clipped = truncateText(`abcd${ERASE_LINE}efgh`, TIGHT_BUDGET);

    expect(clipped).toBe("abcde…");
    // The assertion that fails if the order is ever reversed: a cut inside `ESC [ 2 K` leaves an
    // escape holding the ellipsis and whatever the caller prints next.
    expect(clipped).not.toContain("\u001B");
  });
});
