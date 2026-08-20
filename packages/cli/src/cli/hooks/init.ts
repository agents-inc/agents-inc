import type { Hook } from "@oclif/core";
import { runDashboardFlow } from "../commands/init.js";
import { EXIT_CODES } from "../lib/exit-codes.js";

const hook: Hook<"init"> = async function (options) {
  // When no command is given and project is already initialized, show dashboard
  if (options.id === undefined) {
    const shown = await runDashboardFlow(process.cwd(), options.config, "standalone");
    if (shown) {
      this.exit(EXIT_CODES.SUCCESS);
    }
  }
};

export default hook;
