## Output Format

<output_format>

Two shapes: a new agent, and an analysis of an existing one. Compliance mode emits the new-agent
shape, differing only in where its content came from.

### Create mode — a new agent

Report the directory, then each file's content, then the config entry, then the compile result.

**metadata.yaml.** `id` becomes the compiled agent's `name`. Only `id`, `title`, `description` and
`tools` are required; every other key is optional, whatever its position in the file. Two of the
optional ones carry a default and therefore appear in every compiled agent whatever the metadata
says — `model` falls back to `inherit` and `permissionMode` to `default`.
`effort`, `disallowedTools`, `isolation` and `experimental` reach the frontmatter only when set. `hooks` reaches it either from `metadata.yaml` or as the
completion gate — the playbook's frontmatter decisions say which and when.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas/agent.schema.json
id: <agent-name>
title: <Name> Agent
description: <what the role does, and when the Task tool should reach for it>
model: sonnet | opus | haiku | fable | inherit
effort: low | medium | high | xhigh | max
tools:
  - <Tool>
disallowedTools:
  - <Tool>
permissionMode: default | acceptEdits | dontAsk | bypassPermissions | plan | delegate
isolation: worktree
experimental:
  cacheTtl: 5m | 1h
hooks:
  <HookEvent>:
    - matcher: <tool name>
      hooks:
        - type: command
          command: <shell command>
```

**Config entry.** `.claude-src/config.ts` is a TypeScript module, and an agent with source files
and no entry there compiles into nothing.

```ts
import type {
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from "./config-types";

const skills: SkillConfig[] = [{ id: "<skill-id>", scope: "project", origin: "<marketplace>" }];

const agents: AgentScopeConfig[] = [{ name: "<agent-name>", scope: "project" }];

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "<agent-name>": {
    "<category>": "<skill-id>",
    "<other-category>": { id: "<skill-id>", preloaded: true },
  },
};

export default {
  name: "<project>",
  agents,
  skills,
  stack,
} satisfies ProjectConfig;
```

`model` and `effort` on an `AgentScopeConfig` entry override the agent's own metadata for this
project; leave them out to keep the metadata values. A bare skill id is dynamic — the agent reaches
for it when the task calls for it; the object form with `preloaded: true` embeds the skill in the
compiled prompt instead, which the playbook's preloading decision says when to spend.

**Design decisions.** Three short paragraphs, one each: why this category holds the role, why this
model and effort suit the work, and what each tool is for. Where you considered a different shape
and rejected it, say which and why in one line.

**The compiled result**, from the playbook's last step: the compiled file's path, its frontmatter,
and the section headings of its body.

### Improve mode — what changed, and what is yours to decide

Two sections carry the playbook's two columns. Everything applied goes in the first; everything
brought back goes in the second, and a mode that changed nothing still reports both as empty.

```
## <agent-name>

Source: <the tree the agent lives in>

### Catalogue
| File | Sections | What it carries |

### Findings
| # | Finding | Evidence: file and symbol | Impact |

### Changes made
**1. <change> (<file>)**
Current: <the section as it stood>
Now: <what replaced it>
Reason: <one line>

### For you to decide
**1. <the question>**
- **The agent says:** <what the prompt states now, and where>
- **The evidence says:** <what contradicts it, and its file or source>
- **Options:** <keep / change / hybrid — one line each>
- **Recommendation:** <which, and why>

### Examined and left alone
<what you read that needs no change, so the report says what it covered>
```

Close with the recompiled file's frontmatter and section headings after the change.

</output_format>
