import { describe, expect, it } from "vitest";
import { invocationsIn } from "./handed-out-invocations.js";

// Fixtures keep the source's quoting and punctuation: that is what ends a command name.
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
        "'${CLI_INVOKE_COMMAND} uninstall' from '${scopeRoot}', which still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init --from <id>'",
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

  // Deliberate over-read: without quotes, the command's end can't be found without the roster.
  it("reads unquoted prose after an invocation as part of it", () => {
    expect(
      invocationsIn("Run ${CLI_INVOKE_COMMAND} update to refresh the marketplace"),
    ).toStrictEqual([["update", "to", "refresh", "the", "marketplace"]]);
  });
});
