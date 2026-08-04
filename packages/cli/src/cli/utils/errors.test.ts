import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";

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
