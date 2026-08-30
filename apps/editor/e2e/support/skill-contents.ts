import {
  skillContentsHandlers,
  skillTreeUnreachableHandler,
} from "@workspace/api-mocks"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"

// An external skill's own directory, stubbed at the browser boundary. What
// these specs test is the intake — the dropdown, the refusal, and what ends up
// in the payload — not GitHub.
//
// Two origins, because the real fetch uses two and the split is deliberate. The
// git trees API lists the repository in ONE call whatever the nesting depth,
// which is what keeps a `reference/` directory from costing a second request
// against the sixty-an-hour anonymous limit; every file after that comes off
// raw.githubusercontent.com, which has no API limit and answers
// `access-control-allow-origin: *`. A stub pointed at one origin would be
// testing a design the editor does not have.
//
// Both are `@workspace/api-mocks`' handlers, the same ones the Vitest suite
// runs — which is what keeps the tree's shape, the decoy beside the skill and
// the path arithmetic under the raw CDN from being written twice.

/** Every allowlisted repository, answering with the skill directory it holds. */
export const stubSkillContents = (page: Page) =>
  stubWith(page, skillContentsHandlers)

/**
 * GitHub unreachable while listing. The one failure retrying fixes, and the
 * only one the dialog may invite a retry for.
 */
export const stubSkillContentsUnreachable = (page: Page) =>
  stubWith(page, [skillTreeUnreachableHandler])
