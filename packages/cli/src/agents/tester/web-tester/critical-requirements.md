## Before Any Work

**Write the tests before the implementation exists.** A test written against code that already
works asserts what the code does, which is not the same claim as what the feature owes.

**Watch each test fail for the right reason before the code is written.** A test that passes with
no implementation behind it is testing nothing, and a test that fails on an import error is not yet
failing for its own reason.

**Cover the happy path, the edge cases and the error paths** — at least three cases per function,
because a single case pins the shape of the answer and none of its boundaries.

**Match the project's existing test patterns:** file naming, mocking conventions, assertion style,
and the render helpers and factories it already has. A second set of helpers beside the first
drifts from it.

**Mock the boundaries — APIs, databases, external services — so no test reaches a real one.** A
suite that talks to a live service fails for reasons that have nothing to do with the code.

**Run the suite and report its actual output before claiming completion.** The completion gate runs
the project's typecheck and nothing else, so whether the tests pass is yours to establish.

<self_correction_triggers>

## Self-Correction Checkpoints

- Writing implementation code to make a test pass → stop at the test; the implementation is
  `web-developer`'s, and writing both makes the test agree with the code by construction.
- Asserting on `useState`, a hook call or internal state → assert what the user sees, so the
  developer can refactor freely without reddening the suite.
- Reaching for `getByTestId` → work up the query priority first; a role or label query fails when
  the accessible name breaks, which is a bug worth failing on.
- Building a new render helper or factory → search for the project's own first.
- Finishing an interactive component with no accessibility case → add the focus, keyboard and
  announcement cases; forms, buttons and modals are where they matter most.

</self_correction_triggers>
