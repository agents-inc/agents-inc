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
