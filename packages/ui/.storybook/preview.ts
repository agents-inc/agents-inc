// Declares the `*.css` side-effect import below. Referenced from this one file
// rather than added to `types` in tsconfig.json, because setting `types` at all
// would stop every other @types package being picked up automatically.
/// <reference types="vite/client" />

import type { Preview } from "@storybook/react-vite"

// The real stylesheet, not a copy — a story rendering against anything else
// would be asserting about tokens the app does not ship.
import "../src/styles/globals.css"

// LIGHT IS THE DEFAULT, NOT A CLAMP, and the difference is the whole of this
// block. Until 2026-08-29 the decorator below stamped `light` unconditionally:
// there were no dark colours to render before the dark ramp was generated, so
// light was what any story got, and pinning it kept a contributor on a
// dark-preference OS from seeing every story in a palette nobody had designed.
//
// A clamp cannot be photographed around, though, and that is what made it a
// problem rather than a preference: the app ships two themes and Chromatic was
// diffing one of them, so a dark-only regression — a token pointing at its own
// light value, an inverted surface losing its border — had no baseline anywhere
// in this repository that could catch it.
//
// So the theme is a Storybook GLOBAL now. `initialGlobals` keeps the old
// behaviour for everyone who does not ask (a fresh workshop, and `vitest run`,
// which renders every story headless and would otherwise be asserting axe
// against whichever palette the machine preferred), and the `chromatic.modes`
// block below is what asks. The same global drives the toolbar control, so the
// workshop can switch by hand.
type Theme = "light" | "dark"

const DEFAULT_THEME: Theme = "light"

// `tokens.css` switches the palette on `[data-theme="dark"]`, and on
// `prefers-color-scheme` guarded by `:not([data-theme="light"])` — so stamping
// the attribute beats the OS in both directions, which is what makes the global
// authoritative rather than advisory.
//
// That guard is not Terrazzo's doing and was not there at first: it emits the
// media block against a bare `:root`, so stamping light did nothing on a
// dark-preference machine and this pin was silently not pinning.
// `scripts/hexify-tokens.ts` adds it, and says why.
const stampTheme = (theme: Theme) => {
  document.documentElement.dataset["theme"] = theme
}

// Globals are untyped strings arriving from a URL, so anything but the one
// value that means dark falls back to the default rather than stamping
// something `tokens.css` has no block for.
const themeFrom = (globals: Record<string, unknown>): Theme =>
  globals["theme"] === "dark" ? "dark" : DEFAULT_THEME

const preview: Preview = {
  initialGlobals: { theme: DEFAULT_THEME },

  globalTypes: {
    theme: {
      description: "The palette the story is drawn with",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },

  // A decorator rather than a `loader` or a preview-head script, because it has
  // to run for every story including the ones vitest renders headless, and
  // because it has to re-run when the global changes rather than once per page.
  decorators: [
    (Story, { globals }) => {
      stampTheme(themeFrom(globals))
      return Story()
    },
  ],

  parameters: {
    layout: "centered",

    // MODES ARE HOW CHROMATIC PHOTOGRAPHS THE SECOND THEME. Each one is a set
    // of Storybook globals, applied on top of `initialGlobals`, and Chromatic
    // captures every story once per mode — so the decorator above is the only
    // thing that has to understand a theme; nothing else in the package does.
    //
    // Declared here rather than per story, because there is no story this does
    // not apply to: a component whose dark render nobody has looked at is a
    // component with half a baseline, and the whole reason the pin came out is
    // that half was all there was. A story that genuinely has no dark opinion
    // can opt out with `modes: { dark: { disable: true } }` in its own
    // parameters.
    //
    // EACH MODE CARRIES ITS OWN BASELINE AND ITS OWN APPROVAL, so turning this
    // on does not disturb the accepted light renders — it adds a set of dark
    // ones with no baseline to compare against, which arrive as additions and
    // have to be accepted once.
    chromatic: {
      modes: {
        light: { theme: "light" },
        dark: { theme: "dark" },
      },
    },

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
    //
    // The ruling was made against the light palette's measured ratios and does
    // not transfer to the dark one — which costs nothing today, because axe
    // runs under `vitest run` and that run never leaves `initialGlobals`. It
    // would start costing something the day a dark story is added to the vitest
    // projects, and that is the moment to re-measure rather than to widen this.
    a11y: {
      test: "error",
      config: { rules: [{ id: "color-contrast", enabled: false }] },
    },
  },
}

export default preview
