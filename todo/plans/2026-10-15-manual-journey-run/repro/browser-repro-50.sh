#!/usr/bin/env bash
# Journey 50 defect: every keystroke in the docked composer scrolls the page down by 66px.
# Needs: the editor dev server at http://localhost:5173/editor/ (worker optional), and the repo at
# $REPO with apps/editor's @playwright/test and its Chromium installed.
# Expected output: scrollY after each of 10 typed characters, which should stay 0. Observed: 66,132,...,660.
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
const field = page.getByRole("textbox", { name: "Composer prompt" })
await field.waitFor()
const b = await field.boundingBox()
await page.mouse.click(b.x + 300, b.y + 20)            // a real click into the composer, page at the top
console.log("scrollY before typing:", await page.evaluate(() => scrollY))
const ys = []
for (const ch of "Add Prisma") { await page.keyboard.type(ch); await page.waitForTimeout(50); ys.push(await page.evaluate(() => scrollY)) }
console.log("scrollY after each keystroke:", ys.join(","))
console.log("html scroll-padding-bottom:", await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom))
await browser.close()
JS
REPO="$REPO" EDITOR_URL="$EDITOR_URL" node "$D/r.mjs"
rm -rf "$D"
