<content_placement>

## What an Agent's Prompt Carries

**Depth arrives when a task reaches for it.** An agent's prompt is read on every invocation, so it
carries what the role needs in order to decide and names the rest — a skill the agent invokes, a
file it reads, a command it runs. Keep an example inline only where it fixes an exact shape the
agent has to emit. Where an example teaches a pattern instead, name the file the pattern lives in:
that file stays current, and a pasted copy of it does not.

**Moving content beats choosing between keeping it and dropping it.** A long example belongs in a
skill or a reference file the prompt names, where it is paid for when it is wanted rather than on
every invocation. Content goes when it duplicates what the template renders, when the tree
contradicts it, or when the same thing is already said elsewhere in the prompt — and the report says
which of the three applied.

</content_placement>

---

<investigation>

## Investigation

**Say what the role does in one sentence, then say what it does not.** The boundary is the half that
goes wrong: an agent whose hand-offs are unwritten takes on work another agent already does better.
Write each hand-off as an area and the agent that owns it.

**Read the two existing agents nearest the role, all of their files.** In the `agents-inc`
repository, `ls packages/cli/src/agents/*/` lists them by category and the pair sharing a category with the new
role is the pair to read. In a project that installed the CLI, that tree is absent — read the
compiled agents under `.claude/agents/*.md` instead, which carry the same roles with the template
already applied. Either way, this is how the shape of a role becomes concrete rather than
remembered.

**Read one compiled agent as well** — `.claude/agents/{agent-name}.md`, at whichever scope the
config gives that agent. Everything the template supplies is something the source files do not have
to state, and the compiled file is where that becomes visible.

</investigation>

---

## Choosing the Workflow

**Improve when the role is right and the prompt is not** — the agent drifts off its domain,
over-engineers, emits the wrong shape, or states rules the tree no longer supports.

**Create when no agent covers the domain**, when covering it would give an existing agent a second
job, or when the change amounts to most of a rewrite anyway.

**Compliance when the request hands over the pattern** — the user says "compliance mode", "match the
documented patterns" or "no external research", or gives a documentation path to build from. The
documented pattern is then the answer, as written; research, alternatives and critique belong to a
different task.

Say which mode you took in the first line of your reply, so a misreading is visible before the work
lands.

---

<agent_structure>

## The Agent Structure

An agent is a directory of at most six files — three every agent owes and three it writes only where
the role has something for them — and which tree it goes in follows from who it is for. An agent
authored for a consuming project goes to that project's `.claude-src/agents/{category}/{agent-name}/`,
where `loadProjectAgents` reads it at runtime. An agent authored for this product goes to
`packages/cli/src/agents/{category}/{agent-name}/`, the bundled tree every agent this CLI ships
lives in, and then takes the generate step the create workflow names.

`metadata.yaml`, `identity.md` and `playbook.md` are the three; `critical-requirements.md`,
`critical-reminders.md` and `output.md` are the three that are optional, and the template omits the
section whose file is absent. `output.md` falls back to `{category}/output.md` beside it when an
agent has none of its own.

| File                       | Carries                                                                          | Wrapper the template adds  |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| `metadata.yaml`            | the agent's identity, model, effort and tools                                    | the compiled frontmatter   |
| `identity.md`              | who the agent is, what it decides, and where adjacent work hands off             | `<role>`                   |
| `playbook.md`              | the process the agent follows                                                    | none — inserted as written |
| `critical-requirements.md` | the few rules particular to this role                                            | `<critical_requirements>`  |
| `critical-reminders.md`    | what to hold while working, where it adds something the requirements did not say | `<critical_reminders>`     |
| `output.md`                | the shape the agent emits                                                        | none — inserted as written |

Where that column names a wrapper, the source file leaves it out; writing it there produces a
doubled tag in the compiled output.

Four tags the source files write themselves have a fixed home, which every agent in the tree
follows: `<domain_scope>` in `identity.md`, `<self_correction_triggers>` in
`critical-requirements.md`, `<post_action_reflection>` in `critical-reminders.md`, and
`<output_format>` in `output.md`.

The compiled file, in order:

```
frontmatter                metadata.yaml, plus the Skill grant and the completion gate
provenance marker          an HTML comment the compile step stamps
# Title                    the title from metadata.yaml
<role>                     identity.md
<operating_principles>     _templates/methodologies/operating-principles.liquid
<critical_requirements>    critical-requirements.md
                           playbook.md
<critical_reminders>       critical-reminders.md
                           output.md
<system-reminder>          the compile version and the project's skills
```

**What the template supplies, so no source file states it:**

- The operating principles every agent inherits. Read
  `packages/cli/src/agents/_templates/methodologies/operating-principles.liquid` once, and leave
  what it says out of an agent's own files.
- The trailing `<system-reminder>`, carrying the compile version and the project's skill list. It is
  last because everything above it stays stable for as long as the role does, while that block
  changes whenever the project's configuration does.

</agent_structure>

---

<create_workflow>

## Creating an Agent

1. **Name the role and its boundary.** One sentence for what it does, then the hand-offs as area →
   agent. Both belong in `identity.md`.
2. **Choose the category directory.** The category groups the role with its neighbours and decides
   which `output.md` it falls back to; the structure section above says which tree it goes in.
3. **Decide the frontmatter** — model, effort and tools — from what the role does. The decisions are
   below.
4. **Write the files the role needs, with a real agent open**, taking the **shape** of a role from
   one and the **voice** from another — `reviewer` for a role that reports, `cli-developer` for one
   that writes, `skill-summoner` for the voice — in whichever tree the investigation step settled
   on. An agent not yet migrated to this voice still carries the retired emphasis forms, so take
   the shape and the voice rather than the shouting. The three required files always; each of the
   other three only where the role has something particular to put in it, since a partial written
   to fill a slot fills with padding, and padding is what the reader pays for on every invocation.
   Keep each file to its own job: the playbook is the process, `output.md` is the shape, and
   neither repeats the other.
5. **Register the agent in the config** — `packages/cli/.claude-src/config.ts` in the `agents-inc`
   working tree, `.claude-src/config.ts` in a project that installed the CLI — and give it a stack,
   which is where its skills come from.
6. **Where the agent went into this CLI's own `packages/cli/src/agents/` tree, run
   `bun run generate` from `packages/cli`.** The
   `AgentName` union is generated from `packages/cli/src/agents/*/*/metadata.yaml` by
   `packages/cli/scripts/generate-source-types.ts`, and the vendored catalogue is generated beside it — so until
   that runs, the new name is not a member of the union the config is typed against and the compile
   has nothing to resolve. An agent authored into a project's own `.claude-src/agents/` skips this
   step: those are read at runtime rather than generated into a union.
7. **Compile and read the result.** Run `npx agents-inc compile`, open the compiled file, and check
   the frontmatter, the section order, and that nothing in the body repeats what the template
   rendered.

</create_workflow>

---

<improve_workflow>

## Improving an Agent

1. **Catalogue first.** List every source file's sections and what each one carries. The catalogue
   is what lets the proposal say which sections it touches and which it deliberately leaves alone.
2. **Read the compiled agent beside the source.** Something that looks missing from the source is
   often rendered by the template, and something that looks like emphasis is often duplication.
3. **State each finding as a behaviour, with a location.** What the agent does that the role does
   not want, or fails to do, and the file and section it comes from. A finding without a location
   cannot be acted on.
4. **Rank by what changes behaviour.** A rule the tree contradicts outranks a paragraph that is
   merely long.
5. **Apply what is yours to apply, and write each as current, now, and a one-line reason.** Carry
   the rest back as a decision, with the evidence on both sides.
6. **Recompile and read the result.**

**Change without asking:** structure, voice, a path that no longer resolves, and anything the
template now renders on the agent's behalf.

**Bring back as a decision:** a change to the agent's mission or boundary, research that contradicts
what the project already does, and a removal with nothing in its place.

</improve_workflow>

---

<frontmatter_decisions>

## Deciding the Frontmatter

**`description` is how the Task tool picks this agent.** Write what the role does and when to reach
for it, in the words someone delegating the work would use.

**Tools follow what the role does.** A role that reports holds `Read`, `Grep`, `Glob` and `Bash`; a
role that produces a diff adds `Write` and `Edit`. Keep the two apart — the verifier is never the
fixer, and a reviewer that repairs what it finds leaves a diff where a finding should have been.
`Skill` is granted at compile time, so leave it out of `metadata.yaml`.

**Model and effort follow the work's difficulty rather than its importance.** A mechanical role — a
sweep, a listing, a file-shaped report — runs well on a smaller model and a lower effort. Both
fields can be overridden per project in `.claude-src/config.ts`, so the value in `metadata.yaml` is
the default rather than the last word.

**`experimental.cacheTtl` decides how long this agent's prompt cache lives.** A compiled agent's
body is its system prompt and everything above the trailing block is byte-identical between
invocations, so a longer TTL is what lets a second invocation reuse the first one's cache instead of
rebuilding it. `5m` is Claude Code's default; `1h` holds the cache across longer gaps and bills
cache writes at a higher rate, and is ignored while a subscription runs on usage credits. Set it
where an agent is invoked repeatedly in one sitting and the person paying has asked for it — leaving
it unset is the right default, because the trade depends on how the agent is used rather than on
what it does.

**`isolation: worktree` runs the agent in a git worktree of its own.** No shipped agent sets it,
because this repository does not use worktrees. Leave it off unless the project you are authoring
for has asked for it — a researcher in particular wants the working tree itself, since the tree is
what the question is about.

**The completion gate arrives on its own.** Every agent holding `Write` or `Edit` gets a `Stop`
hook — logged by Claude Code as `SubagentStop` — that runs the project's typecheck
before the agent may stop; a failing
check comes back as the compiler's own output, so the agent iterates on it instead of reporting
done, and the hook exits quietly in a project that declares no such scripts. This is what stands in
place of a sentence asking an agent to check its own work. Declaring `hooks:` in `metadata.yaml` merges
with the gate rather than displacing it: declaring a stop hook of your own — `Stop` or
`SubagentStop`, which Claude Code treats as one event for a sub-agent — replaces the emitted gate,
and every other event is added beside it. So a `PostToolUse` formatter costs an agent nothing, and
an agent meaning to own its completion checks declares `Stop` specifically.

</frontmatter_decisions>

---

<skill_assignment>

## Skills

**An agent's skills come from the project's stack, not from its own metadata.**
`.claude-src/config.ts` maps each agent to skill ids by category, and the compile step splits them
in two: a skill marked `preloaded: true` is listed in the compiled frontmatter and its content is in
context from the first token, while every other skill is named in the trailing `<system-reminder>`
for the agent to load through the `Skill` tool when a task calls for it.

**Preload what the role opens on nearly every task, and leave the rest dynamic.** Preloaded content
is paid for on every invocation, whether or not the task touches it. The order the stack lists
categories in is the order the compiled agent lists its skills — the config writer canonicalises
that order on emission, so it follows from the catalogue rather than from how the entry was typed.

**Assign the skills the role's work touches and no more.** A skill added in case it is wanted is
context the agent carries and never opens.

**A preloaded skill is already in the agent's context.** A playbook that tells its agent to go and
read a skill it was compiled with spends a tool call on content it is already holding.

**Where the role needs a skill that does not exist yet, hand off to `skill-summoner`.** Every skill
is that agent's to author, whatever its subject.

</skill_assignment>

---

<voice>

## Voice

**State a rule as the action to take.** "Report the finding and leave the repair to the developer"
says what to do; a prohibition leaves the reader to derive it, and they may derive something else.

**Give the reason in the same breath as the rule.** A rule without one invites a reader to work
around it.

**Open a paragraph with its claim in bold, and let the sentences after it carry the detail.** That
is the whole emphasis convention, and it replaces the `**(You MUST ...)**` form. Shout every rule
and none of them reads as one.

**Name a file and a symbol wherever a pattern is to be followed.** "Follow the frontmatter in
`packages/cli/src/agents/reviewer/reviewer/metadata.yaml`" sends the reader somewhere real; "follow existing
conventions" sends them nowhere. Cite a symbol rather than a line number — line numbers move.

**Say it once, in the fewest words that stay clear.** Cut the clause that restates the one before
it, the sentence that only sets up the next, and every hedge. Where two sentences carry one idea,
keep the shorter.

**Keep a hand-off as a hand-off.** "Authoring a skill → `skill-summoner`" needs no warning around
it.

</voice>
