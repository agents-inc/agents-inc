import { describe, expect, it } from "vitest";
import { invocationsIn } from "./handed-out-invocations.js";

/**
 * The reader's own tests. It is held against the real `src/cli/` tree by the gate in
 * `../handed-out-invocations.test.ts`; what is proved here is that it reads a message the way a
 * person does, on the forms the messages are actually written in.
 *
 * Each fixture is one message as it is written in source — the interpolation and the punctuation
 * around it — because the punctuation is what ends a command name, and a fixture that dropped it
 * would prove the reader works on a shape no message takes.
 */
describe("reading the invocations a message hands out", () => {
  it("takes the command out of a quoted instruction", () => {
    expect(invocationsIn("Run '${CLI_INVOKE_COMMAND} init' to create one.")).toStrictEqual([
      ["init"],
    ]);
  });

  it("takes it out of a backticked one too", () => {
    expect(
      invocationsIn("no project config found. Run `${CLI_INVOKE_COMMAND} init` first."),
    ).toStrictEqual([["init"]]);
  });

  it("keeps a topic and its command together", () => {
    expect(invocationsIn("`${CLI_INVOKE_COMMAND} build marketplace`,")).toStrictEqual([
      ["build", "marketplace"],
    ]);
  });

  it("stops at a flag, so the command is what gets run and not its arguments", () => {
    expect(
      invocationsIn("'${CLI_INVOKE_COMMAND} build marketplace --name <your-marketplace>'."),
    ).toStrictEqual([["build", "marketplace"]]);
  });

  it("stops at an interpolated argument", () => {
    expect(
      invocationsIn("Run '${CLI_INVOKE_COMMAND} search ${skillId}' to find available skills"),
    ).toStrictEqual([["search"]]);
  });

  it("reads both commands out of a message that hands out two", () => {
    expect(
      invocationsIn(
        "'${CLI_INVOKE_COMMAND} uninstall' still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init'",
      ),
    ).toStrictEqual([["init"], ["uninstall"]]);
  });

  it("names an invocation once however many messages hand it out", () => {
    expect(
      invocationsIn(
        "Run '${CLI_INVOKE_COMMAND} init' first.\nRun '${CLI_INVOKE_COMMAND} init' to create a configuration",
      ),
    ).toStrictEqual([["init"]]);
  });

  it("finds nothing in prose that only mentions the constant", () => {
    expect(invocationsIn('export const CLI_INVOKE_COMMAND = "npx agents-inc";')).toStrictEqual([]);
  });

  /**
   * The deliberate over-read, pinned so it is a decision rather than a surprise. An invocation
   * written without quotes runs into the prose after it, and there is no way to tell where the
   * command ends without already knowing the roster — which is the question this whole mechanism
   * exists because nothing can answer statically. It reads as ambiguous to a person too, and the
   * gate naming a command nobody recognises is the right place to find that out.
   */
  it("reads unquoted prose after an invocation as part of it", () => {
    expect(
      invocationsIn("Run ${CLI_INVOKE_COMMAND} update to refresh the marketplace"),
    ).toStrictEqual([["update", "to", "refresh", "the", "marketplace"]]);
  });
});
