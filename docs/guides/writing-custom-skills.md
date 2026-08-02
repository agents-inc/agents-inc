# Writing Custom Skills and Subagents

Create your own skills and subagents to extend the framework with project-specific knowledge.

## Skills

```bash
npx agents-inc new skill
```

Scaffolds a new skill with the required file structure:

```
skills/{skill-name}/
  SKILL.md         # Skill content
  metadata.yaml    # Name, domain, category, relationships
```

You can also iterate on existing skills by ejecting them first (`npx agents-inc eject skills`) and modifying the local copies. The `skill-summoner` subagent can help you author and refine skills.

## Subagents

```bash
npx agents-inc new agent
```

Scaffolds a new subagent with `identity.md`, `playbook.md`, and optionally `output.md` / `critical-requirements.md`. Custom subagents are composed from skills just like the built-in ones.

The `agent-summoner` subagent can help you design and build new agents.

## After creating

Run `npx agents-inc compile` to rebuild your subagents with the new skills or agents included.
