import {
  skillContentsHandlers,
  skillTreeUnreachableHandler,
} from "@workspace/api-mocks"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"

// An external skill's directory, stubbed on both origins the real fetch uses.

/** Every allowlisted repository, answering with the skill directory it holds. */
export const stubSkillContents = (page: Page) =>
  stubWith(page, skillContentsHandlers)

/**
 * GitHub unreachable while listing. The one failure retrying fixes, and the
 * only one the dialog may invite a retry for.
 */
export const stubSkillContentsUnreachable = (page: Page) =>
  stubWith(page, [skillTreeUnreachableHandler])
