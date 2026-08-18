import {
  EXTERNAL_SKILL,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  OTHER_EXTERNAL_SKILL,
} from "@workspace/api-mocks/fixtures"

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
// The fixtures come from `@workspace/api-mocks`, the same ones MSW serves the
// unit suite — two mechanisms, one statement of the response.

const TREE_URL = `${GITHUB_API_ORIGIN}/repos/*/**/git/trees/**`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/**`

const SKILLS = [EXTERNAL_SKILL, OTHER_EXTERNAL_SKILL]

const NOT_FOUND = 404

const skillFor = (url: string) =>
  SKILLS.find((skill) => url.includes(skill.repo))

const blobsOf = (skill: (typeof SKILLS)[number]) =>
  Object.entries(skill.files).map(([relative, text]) => ({
    path: `${skill.path}/${relative}`,
    type: "blob",
    size: text.length,
    sha: relative,
  }))

/**
 * Every allowlisted repository, answering with the skill directory it holds.
 *
 * The tree carries a decoy beside the skill, because a listing filtered by
 * prefix is only proved by an entry the prefix has to exclude.
 */
export const stubSkillContents = async (page: Page) => {
  await page.route(TREE_URL, (route) => {
    const skill = skillFor(route.request().url())
    if (!skill) {
      return route.fulfill({
        status: NOT_FOUND,
        json: { message: "Not Found" },
      })
    }

    return route.fulfill({
      status: 200,
      json: {
        sha: "HEAD",
        truncated: false,
        tree: [
          { path: "README.md", type: "blob", size: 12 },
          ...blobsOf(skill),
        ],
      },
    })
  })

  await page.route(RAW_URL, (route) => {
    const url = new URL(route.request().url())
    const skill = skillFor(url.pathname)
    // `/{owner}/{repo}/{ref}/{path…}` — the skill's own directory starts at the
    // fourth segment.
    const full = url.pathname.split("/").slice(4).join("/")
    const text =
      skill?.files[
        full.slice(skill.path.length + 1) as keyof typeof skill.files
      ]

    return text === undefined
      ? route.fulfill({ status: NOT_FOUND, body: "404: Not Found" })
      : route.fulfill({ status: 200, body: text })
  })
}

/**
 * GitHub unreachable while listing. The one failure retrying fixes, and the
 * only one the dialog may invite a retry for.
 */
export const stubSkillContentsUnreachable = (page: Page) =>
  page.route(TREE_URL, (route) => route.abort("failed"))
