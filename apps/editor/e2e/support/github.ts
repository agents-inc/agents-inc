import type { Page } from "@playwright/test"

// The add-skill dialog is the only thing in the app that reaches the network,
// and it talks to GitHub's public search directly. Left unmocked the specs
// would depend on a third party that rate-limits at 10 requests a minute, so
// every add-skill spec installs one of these.

const GITHUB_SEARCH = "**/api.github.com/search/repositories**"

export type StubRepo = {
  full_name: string
  description: string | null
  stargazers_count: number
  language: string | null
}

// Matches `reanim`, so the highlighting assertion has something to find.
export const SEARCH_TERM = "reanim"

export const SEARCH_RESULTS: StubRepo[] = [
  {
    full_name: "software-mansion/react-native-reanimated",
    description: "Declarative gesture and animation runtime for React Native.",
    stargazers_count: 9100,
    language: "TypeScript",
  },
  {
    full_name: "framer/motion",
    description: "Animation library for React.",
    stargazers_count: 23000,
    language: "TypeScript",
  },
  {
    full_name: "pmndrs/react-spring",
    description: "Spring-physics animation for React and React Native.",
    stargazers_count: 28000,
    language: "TypeScript",
  },
]

// Repo name → the name the app derives for the cell.
export const repoSkillName = (fullName: string) =>
  fullName.split("/").pop() ?? fullName

export async function mockGitHubSearch(
  page: Page,
  repos: StubRepo[] = SEARCH_RESULTS
) {
  await page.route(GITHUB_SEARCH, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: repos }),
    })
  )
}

export async function mockGitHubRateLimit(page: Page) {
  await page.route(GITHUB_SEARCH, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "API rate limit exceeded" }),
    })
  )
}

export async function mockGitHubUnreachable(page: Page) {
  await page.route(GITHUB_SEARCH, (route) => route.abort("failed"))
}
