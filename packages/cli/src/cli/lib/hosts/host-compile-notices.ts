import { claudeCompileNotices } from "./claude-project-trust.js";
import { codexCompileNotices } from "./codex-compile-notices.js";
import type { Provider } from "../../consts.js";

/** The one source `init` and `compile` share, so they cannot say different things. */
export async function hostCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  switch (provider) {
    case "claude":
      return claudeCompileNotices(provider, projectDir);
    case "codex":
      return codexCompileNotices(provider, projectDir);
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}
