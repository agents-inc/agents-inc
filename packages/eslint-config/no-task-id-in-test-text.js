const TASK_ID = "/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/"

const TEST_CALL = "CallExpression[callee.name=/^(describe|it|test)$/]"
const EXPECT_CALL = "CallExpression[callee.name='expect']"

const IN_A_LITERAL = `Literal[value=${TASK_ID}]`
const IN_A_TEMPLATE = `TemplateLiteral TemplateElement[value.raw=${TASK_ID}]`

const IN_A_TEST_NAME = [
  `${TEST_CALL} > ${IN_A_LITERAL}`,
  `${TEST_CALL} > ${IN_A_TEMPLATE}`,
].join(", ")

/** A message over the line width is concatenated or templated, so both are read. */
const IN_AN_ASSERTION_MESSAGE = [
  `${EXPECT_CALL} > ${IN_A_LITERAL}`,
  `${EXPECT_CALL} > BinaryExpression ${IN_A_LITERAL}`,
  `${EXPECT_CALL} > ${IN_A_TEMPLATE}`,
].join(", ")

/** Its own rule rather than a `no-restricted-syntax` entry, whose options the last block replaces. */
export const noTaskIdInTestText = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow tracker task IDs in test names and assertion messages.",
    },
    messages: {
      testName:
        "Task IDs do not belong in test names — describe the behaviour instead. IDs go in file-level JSDoc only.",
      assertionMessage:
        "Task IDs do not belong in assertion messages — state the invariant instead.",
    },
    schema: [],
  },
  create: (context) => ({
    [IN_A_TEST_NAME]: (node) => context.report({ node, messageId: "testName" }),
    [IN_AN_ASSERTION_MESSAGE]: (node) =>
      context.report({ node, messageId: "assertionMessage" }),
  }),
}
