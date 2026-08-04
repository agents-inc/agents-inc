// Regenerates src/lib/skill-icon-map.ts.
//
//   bun scripts/generate-skill-icons.mjs
//
// Two sources, in order:
//   1. An automatic pass that matches a skill slug against simple-icons ("vitest" → "vitest").
//   2. OVERRIDES below, which is the reviewed part — every brand whose simple-icons slug differs
//      from ours ("nextjs" → "nextdotjs"), plus `null` for automatic matches that are wrong.
//
// Every emitted slug is checked against simple-icons before writing, so a brand the library drops
// (it has removed OpenAI, AWS and Playwright, among others) fails here rather than at runtime.

import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as simpleIcons from "simple-icons"
import { CATALOG } from "../../../packages/matrix/src/index.ts"

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const iconSlugs = new Set(Object.values(simpleIcons).map((icon) => icon.slug))

/** `null` rejects an automatic match. A string sets or replaces one. */
const OVERRIDES = {
  // Automatic matches that latched onto the wrong word.
  "dnd-kit": null, // matched "kit"
  "offline-first": null, // matched "first"
  "ble-nfc": null, // generic NFC glyph, not a brand
  "better-auth-drizzle-hono": "betterauth", // the skill is Better Auth, not Hono

  // Brands whose simple-icons slug differs from our skill slug.
  "angular-standalone": "angular",
  "anthropic-sdk": "anthropic",
  "apollo-server": "apollographql",
  "aws-sdk": null, // simple-icons no longer ships an AWS mark
  "claude-vision": "claude",
  cockroachdb: "cockroachlabs",
  "cypress-e2e": "cypress",
  "expo-router": "expo",
  eas: "expo",
  "framer-motion": "framer",
  "git-hooks": "git",
  "google-gemini-sdk": "googlegemini",
  "graphql-apollo": "apollographql",
  "huggingface-inference": "huggingface",
  "mistral-sdk": "mistralai",
  msw: "mockserviceworker",
  nativewind: "tailwindcss",
  nextjs: "nextdotjs",
  "oclif-ink": "oclif",
  openapi: "openapiinitiative",
  payload: "payloadcms",
  "pnpm-workspaces": "pnpm",
  "posthog-analytics": "posthog",
  "posthog-flags": "posthog",
  "react-native": "react",
  "react-native-security": "react",
  "react-navigation": "react",
  "react-three-fiber": "threedotjs",
  "redux-toolkit": "redux",
  "resend-react-email": "resend",
  rxjs: "reactivex",
  "socket-io": "socketdotio",
  solidjs: "solid",
  sveltekit: "svelte",
  tailwind: "tailwindcss",
  "tanstack-form": "tanstack",
  "tanstack-router": "tanstack",
  "tanstack-table": "tanstack",
  "tauri-backend": "tauri",
  "tauri-bundling": "tauri",
  "tauri-mobile": "tauri",
  "tauri-multiwindow": "tauri",
  "tauri-plugins": "tauri",
  "tauri-security": "tauri",
  "turborepo-ci": "turborepo",
  "typescript-config": "typescript",
  "vercel-ai-sdk": "vercel",
  "vercel-kv": "vercel",
  "vercel-postgres": "vercel",
  "vue-composition-api": "vuedotjs",
  "vue-i18n": "vuedotjs",
  "vue-test-utils": "vuedotjs",
  "zod-validation": "zod",
  yoga: "graphql",

  // Every Electron sub-skill shares the one mark.
  "electron-forge": "electron",
  "electron-ipc": "electron",
  "electron-multiwindow": "electron",
  "electron-security": "electron",
  "electron-storage": "electron",
  "electron-testing": "electron",
  "electron-ui": "electron",
  "electron-updater": "electron",
}

/** Longest trailing run of slug segments that names a real brand: "web-mocks-msw" → "msw". */
const autoMatch = (slug) => {
  const parts = slug.split("-")
  for (let start = 0; start < parts.length; start += 1) {
    const candidate = parts.slice(start).join("")
    if (iconSlugs.has(candidate)) return candidate
  }
  return undefined
}

const skills = Object.values(CATALOG.skillsById).sort((a, b) => a.slug.localeCompare(b.slug))

const entries = []
const invalid = []

for (const skill of skills) {
  const override = Object.hasOwn(OVERRIDES, skill.slug) ? OVERRIDES[skill.slug] : undefined
  if (override === null) continue

  const iconSlug = override ?? autoMatch(skill.slug)
  if (!iconSlug) continue

  if (!iconSlugs.has(iconSlug)) invalid.push(`${skill.slug} → ${iconSlug}`)
  else entries.push([skill.slug, iconSlug])
}

if (invalid.length) {
  console.error("Not real simple-icons slugs:\n  " + invalid.join("\n  "))
  process.exit(1)
}

const unmatched = skills.length - entries.length

// Named imports rather than inlined path data: the 113 distinct marks are ~125KB of raw SVG
// path, so they need to stay a tree-shakeable, separately-chunkable import.
const exportNameBySlug = new Map(
  Object.entries(simpleIcons).map(([exportName, icon]) => [icon.slug, exportName]),
)
const imports = [...new Set(entries.map(([, icon]) => icon))]
  .map((icon) => exportNameBySlug.get(icon))
  .sort()

writeFileSync(
  join(APP_ROOT, "src/lib/skill-icons.ts"),
  `// AUTO-GENERATED — run \`bun scripts/generate-skill-icons.mjs\` to refresh.
// Edit the OVERRIDES table in that script, not this file.
//
// ${entries.length} of ${skills.length} skills have a brand mark, drawn from ${imports.length} distinct icons.
// The other ${unmatched} are concepts rather than products ("Caching", "Error Boundaries") or brands
// simple-icons no longer ships, and render as an initials tile — the design's intended fallback.

import {
${imports.map((name) => `  ${name},`).join("\n")}
} from "simple-icons"

/** Skill slug → SVG path data, for a 24×24 viewBox. */
export const SKILL_ICON_PATHS: Record<string, string> = {
${entries.map(([skill, icon]) => `  ${JSON.stringify(skill)}: ${exportNameBySlug.get(icon)}.path,`).join("\n")}
}
`,
)

console.log(
  `wrote ${entries.length} mappings over ${imports.length} icons, ${unmatched} fall back to initials`,
)
