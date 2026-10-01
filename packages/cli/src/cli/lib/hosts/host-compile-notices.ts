import { claudeCompileNotices } from "./claude-project-trust.js";
import { codexCompileNotices } from "./codex-compile-notices.js";
import type { Provider } from "../../consts.js";

/**
 * Everything an install owes the user about its host once the compile is done, as lines — the one
 * place `init` and `compile` both get them from, so the two cannot say different things about one
 * tree.
 *
 * On Codex: the sub-agents left out, the settings a role cannot carry, and the project trust entry
 * (`codexCompileNotices`). On Claude: the trust dialog, while a project's sub-agents, whose
 * completion gate Claude Code drops in an untrusted folder, sit in one it has not been told to
 * trust (`claudeCompileNotices`). Each provider's half is empty on the other.
 */
export async function hostCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  return [
    ...(await codexCompileNotices(provider, projectDir)),
    ...(await claudeCompileNotices(provider, projectDir)),
  ];
}
