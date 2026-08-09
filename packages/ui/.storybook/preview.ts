// Declares the `*.css` side-effect import below. Referenced from this one file
// rather than added to `types` in tsconfig.json, because setting `types` at all
// would stop every other @types package being picked up automatically.
/// <reference types="vite/client" />

import type { Preview } from "@storybook/react-vite"

// The real stylesheet, not a copy — a story rendering against anything else
// would be asserting about tokens the app does not ship.
import "../src/styles/globals.css"

// Light only. `globals.css` declares the `dark` variant but ships no dark
// colours for it (todo/editor.md EDITOR-07, todo/www.md WWW-01), so a dark
// story would render the light palette and quietly claim to have covered a
// theme that does not exist yet.
const preview: Preview = {
  parameters: {
    layout: "centered",

    // The addon ships `test: "todo"`, which reports violations in the Storybook
    // UI and fails nothing — so on the default setting `vitest run` goes green
    // over an inaccessible component. `error` makes axe a gate.
    //
    // `color-contrast` is held out permanently — an owner ruling (2026-08-07),
    // not a pending fix. The measured ratios (amber ink on the accent wash at
    // 3.97:1, the dimmed incompatible cell at 2.4:1) are the design as
    // intended; the palette is a deliberate taste decision for this project.
    // The holdout keeps every *structural* check — names, labels, roles —
    // gating, which is what this suite is for. Do not re-enable the rule
    // expecting a token fix; none is planned.
    a11y: {
      test: "error",
      config: { rules: [{ id: "color-contrast", enabled: false }] },
    },
  },
}

export default preview
