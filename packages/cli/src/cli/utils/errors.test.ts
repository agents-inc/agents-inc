import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";

/** The escape pair a parser's own message carries out of the bytes that broke it. */
const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

/** The thrown value, as a value — `expect().toThrow` cannot hand the error itself back. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
    throw new Error("expected the call to throw, and it did not");
  } catch (error) {
    return error;
  }
}

describe("getErrorMessage", () => {
  it("should extract message from Error instance", () => {
    expect(getErrorMessage(new Error("disk failure"))).toBe("disk failure");
  });

  it("should convert string to string", () => {
    expect(getErrorMessage("something went wrong")).toBe("something went wrong");
  });

  it("should convert number to string", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("should convert null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("should convert undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("renders a parser's account of foreign bytes without the escapes inside them", () => {
    // The real shape rather than an invented one: V8 quotes the offending input back inside the
    // message, so a parse failure carries whatever caused it. The bytes came from a marketplace
    // file or a pipe; the Error object came from Node, and only the second of those looks safe.
    const parseFailure = thrownBy(() => JSON.parse(`{"a":${ERASE_LINE}${CARRIAGE_RETURN}}`));

    const message = getErrorMessage(parseFailure);

    expect(message).not.toContain(ESCAPE);
    expect(message).not.toContain(CARRIAGE_RETURN);
    expect(message).toContain("JSON");
  });

  it("leaves an ordinary message exactly as it was written", () => {
    // The permitted case for the spec above, and for every other spec in this file: a sanitiser
    // that flattened messages would make every error in the CLI worse to read.
    expect(getErrorMessage(new Error("Could not read config: line 3, column 7"))).toBe(
      "Could not read config: line 3, column 7",
    );
  });

  it("keeps the newlines a multi-line error is made of", () => {
    expect(getErrorMessage(new Error("first problem\nsecond problem"))).toBe(
      "first problem\nsecond problem",
    );
  });

  it("should handle Error subclasses", () => {
    expect(getErrorMessage(new TypeError("type mismatch"))).toBe("type mismatch");
  });

  it("should handle Error with empty message", () => {
    expect(getErrorMessage(new Error(""))).toBe("");
  });

  it("should convert boolean to string", () => {
    expect(getErrorMessage(true)).toBe("true");
    expect(getErrorMessage(false)).toBe("false");
  });

  it("should convert object without message to string", () => {
    expect(getErrorMessage({ code: "ENOENT" })).toBe("[object Object]");
  });

  it("should convert object with message property to string (not Error)", () => {
    expect(getErrorMessage({ message: "fake error" })).toBe("[object Object]");
  });

  it("should convert array to string", () => {
    expect(getErrorMessage(["err1", "err2"])).toBe("err1,err2");
  });

  it("should convert symbol to string", () => {
    expect(getErrorMessage(Symbol("test"))).toBe("Symbol(test)");
  });
});
