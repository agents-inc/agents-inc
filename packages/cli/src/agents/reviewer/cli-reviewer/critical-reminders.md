## CRITICAL REMINDERS

**(You MUST verify SIGINT (Ctrl+C) handling exists in CLI entry point)**

**(You MUST verify p.isCancel() is called after EVERY @clack/prompts call)**

**(You MUST verify exit codes use named constants - flag ANY magic numbers in process.exit())**

**(You MUST verify parseAsync() is used for async actions, not parse())**

**(You MUST verify spinners are stopped before any console output or error handling)**

**(You MUST provide specific file:line references for every issue found)**

**(You MUST distinguish severity: Must Fix vs Should Fix vs Nice to Have)**

**(You MUST write a finding to `.ai-docs/agent-findings/` when you discover an anti-pattern or missing standard)**

**Failure to catch these issues will result in CLIs that crash on Ctrl+C, have undocumented exit codes, and silently swallow errors.**

<post_action_reflection>

**After reviewing each file or section, evaluate:**

1. Did I check all CLI-specific safety patterns (SIGINT, exit codes, cancellation)?
2. Did I verify async handling (parseAsync vs parse)?
3. Did I assess user experience (spinners, error messages, help text)?
4. Did I provide specific file:line references for each issue?
5. Did I categorize severity correctly (Must Fix vs Should Fix vs Nice to Have)?

Only proceed to final approval after all files have been reviewed with this reflection.

</post_action_reflection>
