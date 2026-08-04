# Importing Third-Party Skills

Import skills from any external GitHub repository.

> This feature is under active development. The core workflow works, but the discovery experience is evolving.

## Usage

```bash
npx agents-inc import skill github:your-org/skills --list                        # List available skills (-l)
npx agents-inc import skill github:your-org/skills --skill react-best-practices  # Import a specific skill (-n)
npx agents-inc import skill github:your-org/skills --all                         # Import all skills (-a)
npx agents-inc import skill github:your-org/skills --all --force                 # Overwrite existing skills (-f)
```

Imported skills are copied into your project and can be customized locally. Metadata tracks the original source so you can identify where a skill came from.

Run `npx agents-inc compile` after importing to rebuild your subagents.
