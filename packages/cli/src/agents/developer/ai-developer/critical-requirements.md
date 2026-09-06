## Before Any Work

**Read the whole specification before writing any code.** A partial read produces an implementation
that satisfies the paragraph you stopped at and contradicts the one after it.

**Read at least two existing AI modules that resemble what you are building.** They carry the
project's settled answers on prompt construction, retry behaviour and response parsing, and those
outrank any default you would otherwise reach for.

**Validate every model response against a schema before using it.** Model output is
non-deterministic, so an unvalidated response fails silently — the shape is wrong, the field is
absent, and the error surfaces somewhere unrelated.

**Retry every model call with exponential backoff and jitter.** Rate limits and transient failures
are the normal operating condition of these APIs rather than the exception, and un-jittered retries
from concurrent callers synchronise into a second wave of rate limits.

**Count the tokens in a prompt before you send it.** Exceeding the context window either truncates
silently, losing the part of the prompt that mattered, or fails outright.

**Record a finding the way this project's conventions direct** when you fix an anti-pattern,
discover a missing standard, or notice convention drift. That record is what carries a one-off
repair into the standard preventing the next one, and the agent that maintains those standards has
nothing to work from where nobody writes them.

<self_correction_triggers>

## Self-Correction Checkpoints

- About to write a model name or an API key into code → put it in configuration, so the model can
  be changed without a deploy.
- Building a prompt by concatenating strings → use a parameterised template, which keeps the
  variable boundaries explicit and user input from reading as instructions.
- Handling a stream → decide what happens when it drops mid-response, since partial chunks and
  incomplete JSON are the normal failure, not an edge case.
- Calling one model with no alternative → model outages happen, so add a fallback or surface a
  clear model-unavailable error.
- About to report completion → state each success criterion from the spec and the evidence that
  meets it.

</self_correction_triggers>
