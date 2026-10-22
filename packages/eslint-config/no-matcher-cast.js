const CAST = ":matches(TSAsExpression, TSTypeAssertion)"

const ON_EXPECT = "[expression.callee.object.name='expect']"
const ON_EXPECT_NOT =
  "[expression.callee.object.object.name='expect'][expression.callee.object.property.name='not']"

const MATCHER_NAME =
  "/^(any|anything|arrayContaining|closeTo|objectContaining|schemaMatching|stringContaining|stringMatching)$/"
const CALLS_A_MATCHER = `[expression.callee.property.name=${MATCHER_NAME}]`

const MATCHER_CAST = [ON_EXPECT, ON_EXPECT_NOT]
  .map((receiver) => `${CAST}${receiver}${CALLS_A_MATCHER}`)
  .join(", ")

/** Its own rule rather than a `no-restricted-syntax` entry, whose options the last block replaces. */
export const noMatcherCast = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow casting an asymmetric matcher such as expect.any(String).",
    },
    messages: {
      cast: "An asymmetric matcher is not the type it is cast to. Vitest types matchers as `any`, and no-unsafe-assignment accepts `any` only in an `unknown` slot, so type the expected object instead of the matcher: `const expected: Record<keyof Row, unknown> = { id: expect.any(String) }`.",
    },
    schema: [],
  },
  create: (context) => ({
    [MATCHER_CAST]: (node) => context.report({ node, messageId: "cast" }),
  }),
}
