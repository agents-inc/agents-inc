import { z } from "zod";
import { describe, expect, it } from "vitest";

import { formatZodIssue } from "./schema-validator";

/**
 * The one rendering every Zod reporter in this package shares, and so the one place the sanitising
 * is done rather than at each of its callers.
 *
 * All three of the strings it renders come out of the REFUSED DOCUMENT rather than out of the
 * schema: a path segment and an unrecognised key are object keys the document chose, and a custom
 * message quotes the value it received. The documents reaching it are a stranger's `SKILL.md`
 * frontmatter, their `metadata.yaml`, their marketplace manifest and whatever arrived on stdin —
 * so every one of the three is a stranger's string landing on the CLI's own stdout.
 *
 * The PATH arm is pinned by `read-piped-payload.test.ts`, whose refused key travels into
 * `issue.path` and whose honest twin sits beside it there. This file pins the other two, each
 * with a twin of its own: a sanitiser held only against hostile input cannot be told from one
 * that strips everything, and a validation message that lost the key it was naming would have
 * stopped being a validation message.
 */

/** The pair the CLI-855 lane watched a real terminal obey, as a stranger's document carries them. */
const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

/** A key a stranger's manifest chose, carrying that pair. */
const HOSTILE_KEY = `keywords${ERASE_LINE}${CARRIAGE_RETURN} ›   VERIFIED PUBLISHER`;

/** The same key with the terminal's ability to act on it removed, and none of its words. */
const INERT_KEY = "keywords ›   VERIFIED PUBLISHER";

/** A sentence a schema wrote about that document, quoting a value the document chose. */
const HOSTILE_SENTENCE = `a project-scoped skill${ERASE_LINE}${CARRIAGE_RETURN} has nowhere to be written`;

/** The same sentence, inert — and, fed in as-is, the twin that proves the words are kept. */
const INERT_SENTENCE = "a project-scoped skill has nowhere to be written";

/**
 * An unrecognised key exactly as `z.strictObject` raises it, including the message zod writes
 * beside `keys` — which this arm must NOT be the one it reads, since the arm renders the key list.
 *
 * The shipped route is `pluginManifestValidationSchema`, which `plugin-validator.ts` runs a
 * stranger's `plugin.json` through and reports with `formatZodErrors`.
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

/**
 * A custom issue whose message quotes what it refused — the shape `installableSeedPayloadSchema`
 * raises, where the sentence names a sub-agent the payload itself chose.
 *
 * Two of them, because the message is rendered at TWO call sites: one prefixed by a path and one
 * bare. A single issue pins whichever branch its own path selects and leaves the other unguarded.
 */
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
      // The permitted case. Without it the spec above is satisfied by a renderer that drops the
      // key entirely, and a refusal naming no key tells the author nothing to change.
      expect(formatZodIssue(HONEST_UNRECOGNIZED_KEY)).toBe('Unrecognized key: "keywords"');
    });
  });

  describe("a message quoting the value it refused", () => {
    it("renders it under its path without the escapes inside it", () => {
      expect(formatZodIssue(HOSTILE_MESSAGE_UNDER_A_PATH)).toBe(`author.name: ${INERT_SENTENCE}`);
    });

    it("does the same where there is no path to render it under", () => {
      // The second of the two sites the message is sanitised at. The branch is chosen by the
      // path, so nothing feeding a path can reach this one.
      expect(formatZodIssue(HOSTILE_MESSAGE_AT_THE_ROOT)).toBe(INERT_SENTENCE);
    });

    it("still renders an honest message and its path in full", () => {
      // The permitted case, carrying the same words as the two above with the controls left out —
      // so the pair says the sanitiser removed the escapes and nothing else.
      expect(formatZodIssue(HONEST_MESSAGE_UNDER_A_PATH)).toBe(`author.name: ${INERT_SENTENCE}`);
    });
  });
});
