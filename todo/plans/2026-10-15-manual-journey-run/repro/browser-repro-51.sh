#!/usr/bin/env bash
# Journey 51 defect: with the filter bar stuck, typing or moving the caret in its search scrolls the page
# UP ~103px per keystroke, and Tab between the stuck bar's own controls scrolls it up ~400-460px per press
# until the bar unsticks. A mouse click into the stuck search does not scroll.
# Needs: the editor dev server at http://localhost:5173/editor/, and the repo at $REPO with
# apps/editor's @playwright/test and its Chromium installed.
# Expected: scrollY unchanged by every key below. Observed (2026-10-15): 2500 -> 2397,2294,2191,2088,1985
# for e/ArrowLeft/ArrowRight/Home/End, and 3000 -> 2538,2076,1678,1280 (unstuck) for four Tabs.
set -euo pipefail
EDITOR_URL="${EDITOR_URL:-http://localhost:5173/editor/}"
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
D=$(mktemp -d)
cat > "$D/r.mjs" <<'JS'
import { createRequire } from "node:module"
const { chromium } = createRequire(process.env.REPO + "/apps/editor/package.json")("@playwright/test")
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
await page.goto(process.env.EDITOR_URL)
await page.getByRole("group", { name: "Stacks" }).waitFor()
const st = () => page.evaluate(() => `y=${scrollY} stuck=${document.documentElement.hasAttribute("data-bar-stuck")} focus=${(document.activeElement?.getAttribute("aria-label") || document.activeElement?.innerText || "").replace(/\n/g, " ").slice(0, 20)}`)
const search = page.getByLabel("Search skills")
// 1. keystrokes and caret moves in the stuck search
await page.mouse.move(700, 600); await page.mouse.wheel(0, 2500); await page.waitForTimeout(500)
let b = await search.boundingBox()
await page.mouse.click(b.x + 300, b.y + b.height / 2); await page.waitForTimeout(300)
console.log("stuck, search clicked:", await st())
await page.keyboard.type("e"); await page.waitForTimeout(400); console.log("after typing e:     ", await st())
for (const k of ["ArrowLeft", "ArrowRight", "Home", "End"]) { await page.keyboard.press(k); await page.waitForTimeout(250); console.log(`after ${k}:`.padEnd(20), await st()) }
// 2. Tab between the stuck bar's own controls
await search.fill(""); await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0) }); await page.waitForTimeout(400)
await page.mouse.wheel(0, 3000); await page.waitForTimeout(500)
b = await search.boundingBox()
await page.mouse.click(b.x + 300, b.y + b.height / 2); await page.waitForTimeout(300)
console.log("stuck, search clicked:", await st())
for (let i = 1; i <= 4; i++) { await page.keyboard.press("Tab"); await page.waitForTimeout(250); console.log(`after Tab ${i}:`.padEnd(20), await st()) }
console.log("html scroll-padding-top:", await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop))
await browser.close()
JS
REPO="$REPO" EDITOR_URL="$EDITOR_URL" node "$D/r.mjs"
rm -rf "$D"
