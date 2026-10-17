import {
  AGENT_CORPUS,
  CORPUS_CLI_VERSION,
  CORPUS_TEMPLATES,
} from "./generated/corpus.js"
import {
  buildAgentTemplateContext,
  renderAgent,
  renderAgentBody,
  renderAgentRoleToml,
} from "./agent-source.js"
import { createEngineFromTemplates } from "./engine.js"
import { sourceDirName, type Provider } from "./source-layout.js"
import type { AgentConfig, AgentName } from "./types.js"

// Holds the corpus and the engine behind one `import()`; nothing else here may import it.

export { CORPUS_CLI_VERSION }

/** The provider is an argument: the source folder appears in rendered prose. */
const engineFor = (provider: Provider) =>
  createEngineFromTemplates(CORPUS_TEMPLATES, {
    sourceFolder: sourceDirName(provider),
  })

const contextFor = (name: AgentName, agent: AgentConfig) =>
  buildAgentTemplateContext(name, agent, AGENT_CORPUS[name])

/** Byte-identical to `compileAgentForPlugin`'s output, rendered from the vendored corpus. */
export async function renderAgentFromCorpus(
  name: AgentName,
  agent: AgentConfig,
  version: string = CORPUS_CLI_VERSION
): Promise<string> {
  return renderAgent(engineFor("claude"), contextFor(name, agent), version)
}

/** The Codex role file: `renderAgentBody` over `renderAgentRoleToml`, as the CLI installs it. */
export async function renderAgentRoleFromCorpus(
  name: AgentName,
  agent: AgentConfig,
  version: string = CORPUS_CLI_VERSION
): Promise<string> {
  return renderAgentRoleToml(
    agent,
    await renderAgentBody(engineFor("codex"), contextFor(name, agent), version)
  )
}
