import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disableBuffering,
  drainBuffer,
  enableBuffering,
  log,
  pushBufferMessage,
  setVerbose,
  verbose,
  warn,
} from "./logger";

afterEach(() => {
  setVerbose(false);
  disableBuffering();
  vi.restoreAllMocks();
});

describe("setVerbose", () => {
  it("should enable verbose mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    verbose("test");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("should disable verbose mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    setVerbose(false);
    verbose("test");
    expect(spy).not.toHaveBeenCalled();
  });

  it("should toggle back and forth", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    setVerbose(true);
    verbose("first");
    expect(spy).toHaveBeenCalledTimes(1);

    setVerbose(false);
    verbose("second");
    expect(spy).toHaveBeenCalledTimes(1);

    setVerbose(true);
    verbose("third");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("verbose", () => {
  it("should suppress output when verbose mode is off", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    verbose("hidden message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("should output to console.log when verbose mode is on", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    verbose("visible message");
    expect(spy).toHaveBeenCalledWith("  visible message");
  });

  it("should prefix message with two spaces", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    verbose("indented");
    expect(spy).toHaveBeenCalledWith("  indented");
  });
});

describe("log", () => {
  it("should output to console.log when verbose mode is off", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("always visible");
    expect(spy).toHaveBeenCalledWith("always visible");
  });

  it("should output to console.log when verbose mode is on", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    log("still visible");
    expect(spy).toHaveBeenCalledWith("still visible");
  });

  it("should pass the message through without modification", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("exact message");
    expect(spy).toHaveBeenCalledWith("exact message");
  });
});

describe("warn", () => {
  it("should output to console.warn when verbose mode is off", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("problem detected");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("should output to console.warn when verbose mode is on", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setVerbose(true);
    warn("problem detected");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("should prefix message with 'Warning:'", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("something is wrong");
    expect(spy).toHaveBeenCalledWith("  Warning: something is wrong");
  });

  it("should preserve the original message text after the prefix", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warn("Skipping 'foo': missing SKILL.md");
    expect(spy).toHaveBeenCalledWith("  Warning: Skipping 'foo': missing SKILL.md");
  });
});

describe("buffering", () => {
  it("enableBuffering causes warn to push to buffer instead of console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    enableBuffering();
    warn("buffered warning");
    expect(spy).not.toHaveBeenCalled();

    const messages = drainBuffer();
    expect(messages).toStrictEqual([{ level: "warn", text: "buffered warning" }]);
  });

  it("drainBuffer returns all buffered messages and empties the buffer", () => {
    enableBuffering();
    warn("first");
    warn("second");

    const messages = drainBuffer();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toStrictEqual({ level: "warn", text: "first" });
    expect(messages[1]).toStrictEqual({ level: "warn", text: "second" });

    const empty = drainBuffer();
    expect(empty).toHaveLength(0);
  });

  it("disableBuffering restores warn to console.warn behavior", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    enableBuffering();
    warn("buffered");
    expect(spy).not.toHaveBeenCalled();

    disableBuffering();
    warn("direct");
    expect(spy).toHaveBeenCalledWith("  Warning: direct");
  });

  it("verbose is never affected by buffer mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    setVerbose(true);
    enableBuffering();

    verbose("verbose message");
    expect(spy).toHaveBeenCalledWith("  verbose message");

    const messages = drainBuffer();
    expect(messages).toHaveLength(0);
  });

  it("log is never affected by buffer mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    enableBuffering();

    log("log message");
    expect(spy).toHaveBeenCalledWith("log message");

    const messages = drainBuffer();
    expect(messages).toHaveLength(0);
  });

  it("multiple warn calls accumulate in order", () => {
    enableBuffering();
    warn("alpha");
    warn("beta");
    warn("gamma");

    const messages = drainBuffer();
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.text)).toStrictEqual(["alpha", "beta", "gamma"]);
  });

  it("draining twice returns empty on second call", () => {
    enableBuffering();
    warn("once");

    const first = drainBuffer();
    expect(first).toHaveLength(1);

    const second = drainBuffer();
    expect(second).toHaveLength(0);
  });

  it("pushBufferMessage adds messages with specified level", () => {
    enableBuffering();
    pushBufferMessage("info", "info message");
    pushBufferMessage("error", "error message");

    const messages = drainBuffer();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toStrictEqual({ level: "info", text: "info message" });
    expect(messages[1]).toStrictEqual({ level: "error", text: "error message" });
  });

  it("enableBuffering resets any previous buffer", () => {
    enableBuffering();
    warn("leftover");

    enableBuffering();
    const messages = drainBuffer();
    expect(messages).toHaveLength(0);
  });
});
