import { z } from "zod";
import { describe, expect, it } from "vitest";

import { formatZodIssue } from "./schema-validator";

/** Everything `formatZodIssue` renders comes from a stranger's document; each has a twin. */

const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

const HOSTILE_KEY = `keywords${ERASE_LINE}${CARRIAGE_RETURN} ›   VERIFIED PUBLISHER`;

const INERT_KEY = "keywords ›   VERIFIED PUBLISHER";

const HOSTILE_SENTENCE = `a project-scoped skill${ERASE_LINE}${CARRIAGE_RETURN} has nowhere to be written`;

/** The same sentence, inert — and, fed in as-is, the twin that proves the words are kept. */
const INERT_SENTENCE = "a project-scoped skill has nowhere to be written";

/**
 * An unrecognised key as `z.strictObject` raises it; the arm must render `keys`, not zod's message.
 */
const HOSTILE_UNRECOGNIZED_KEY: z.ZodIssue = {
  code: "unrecognized_keys",
  path: [],
  keys: [HOSTILE_KEY],
  message: `Unrecognized key: "${HOSTILE_KEY}"`,
};

const HONEST_UNRECOGNIZED_KEY: z.ZodIssue = {
  code: "unrecognized_keys",
  path: [],
  keys: ["keywords"],
  message: 'Unrecognized key: "keywords"',
};

/** Two issues, because the message is rendered at two call sites: under a path and bare. */
const HOSTILE_MESSAGE_UNDER_A_PATH: z.ZodIssue = {
  code: "custom",
  path: ["author", "name"],
  message: HOSTILE_SENTENCE,
};

const HOSTILE_MESSAGE_AT_THE_ROOT: z.ZodIssue = {
  code: "custom",
  path: [],
  message: HOSTILE_SENTENCE,
};

const HONEST_MESSAGE_UNDER_A_PATH: z.ZodIssue = {
  code: "custom",
  path: ["author", "name"],
  message: INERT_SENTENCE,
};

describe("formatZodIssue", () => {
  describe("an unrecognised key the document chose", () => {
    it("names it without the terminal escapes the document put in it", () => {
      expect(formatZodIssue(HOSTILE_UNRECOGNIZED_KEY)).toBe(`Unrecognized key: "${INERT_KEY}"`);
    });

    it("still names an honest key in full", () => {
      // The permitted case: without it, a renderer that drops the key would pass.
      expect(formatZodIssue(HONEST_UNRECOGNIZED_KEY)).toBe('Unrecognized key: "keywords"');
    });
  });

  describe("a message quoting the value it refused", () => {
    it("renders it under its path without the escapes inside it", () => {
      expect(formatZodIssue(HOSTILE_MESSAGE_UNDER_A_PATH)).toBe(`author.name: ${INERT_SENTENCE}`);
    });

    it("does the same where there is no path to render it under", () => {
      // The bare-message site; the branch is chosen by the path.
      expect(formatZodIssue(HOSTILE_MESSAGE_AT_THE_ROOT)).toBe(INERT_SENTENCE);
    });

    it("still renders an honest message and its path in full", () => {
      // Same words without the controls, so the sanitiser removed the escapes and nothing else.
      expect(formatZodIssue(HONEST_MESSAGE_UNDER_A_PATH)).toBe(`author.name: ${INERT_SENTENCE}`);
    });
  });
});

/** Printed on a line of its own, it would read as the CLI's; folded into its line, it is a quote. */
const FORGED_LINE = "Marketplace verified.";

const KEY_ACROSS_LINES = `homepage\n${FORGED_LINE}`;

/** An escape right before the break: removing the break first would let the escape eat the space. */
const KEY_ACROSS_LINES_BEHIND_AN_ESCAPE = `homepage${ESCAPE}\n${FORGED_LINE}`;

const SLUG_REFUSAL_ACROSS_LINES = `'react\n${FORGED_LINE}' is not a slug the public catalogue carries`;

const SLUG_REFUSAL_ON_ONE_LINE = `'react ${FORGED_LINE}' is not a slug the public catalogue carries`;

describe("formatZodIssue, a value the document wrote across lines", () => {
  it("names an unrecognised key on the one line", () => {
    const issue: z.ZodIssue = {
      code: "unrecognized_keys",
      path: [],
      keys: [KEY_ACROSS_LINES],
      message: `Unrecognized key: "${KEY_ACROSS_LINES}"`,
    };

    expect(formatZodIssue(issue)).toBe(`Unrecognized key: "homepage ${FORGED_LINE}"`);
  });

  it("keeps the space where an escape stood before the line break", () => {
    const issue: z.ZodIssue = {
      code: "unrecognized_keys",
      path: [],
      keys: [KEY_ACROSS_LINES_BEHIND_AN_ESCAPE],
      message: "Unrecognized key",
    };

    expect(formatZodIssue(issue)).toBe(`Unrecognized key: "homepage ${FORGED_LINE}"`);
  });

  it("renders a path through a key the document chose on the one line", () => {
    const issue: z.ZodIssue = {
      code: "custom",
      path: ["agentSkills", KEY_ACROSS_LINES, 0],
      message: INERT_SENTENCE,
    };

    expect(formatZodIssue(issue)).toBe(`agentSkills.homepage ${FORGED_LINE}.0: ${INERT_SENTENCE}`);
  });

  it("renders a message quoting the value under its path on the one line", () => {
    const issue: z.ZodIssue = {
      code: "custom",
      path: ["slug"],
      message: SLUG_REFUSAL_ACROSS_LINES,
    };

    expect(formatZodIssue(issue)).toBe(`slug: ${SLUG_REFUSAL_ON_ONE_LINE}`);
  });

  it("does the same where there is no path to render it under", () => {
    const issue: z.ZodIssue = { code: "custom", path: [], message: SLUG_REFUSAL_ACROSS_LINES };

    expect(formatZodIssue(issue)).toBe(SLUG_REFUSAL_ON_ONE_LINE);
  });
});

describe("formatZodIssue, several unrecognised keys", () => {
  it("names each one, quoted, in one sentence", () => {
    const issue: z.ZodIssue = {
      code: "unrecognized_keys",
      keys: ["keywords", "homepage"],
      path: [],
      message: 'Unrecognized keys: "keywords", "homepage"',
    };

    expect(formatZodIssue(issue)).toBe('Unrecognized key: "keywords", "homepage"');
  });
});
