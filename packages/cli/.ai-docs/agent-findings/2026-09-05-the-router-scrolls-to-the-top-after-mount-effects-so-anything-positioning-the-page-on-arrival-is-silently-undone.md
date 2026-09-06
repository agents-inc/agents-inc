---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/use-domain-scroll.ts
  - apps/editor/src/routes/router.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-09-05
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  `useDomainOnArrival` in apps/editor/src/features/configure/lib/use-domain-scroll.ts waits for the
  router's own render event before scrolling, subscribing from a layout effect so it cannot miss the
  first emit. Verified against a production build as well as the dev server, because the dev-only
  double-invoke of effects is what made the broken version appear to work.
---

## What Was Wrong

EDITOR-79 needed `?domain=api` to open the editor scrolled to the API section. The obvious
implementation — a mount effect that measures the anchor and calls `window.scrollTo` — **runs, scrolls
correctly, and is then silently undone**, landing the reader at the top of the page with no error
anywhere.

TanStack Router installs a scroll-restoration handler in the router constructor
(`setupScrollRestoration`, called from `RouterCore`) and subscribes it to its own `onRendered` event.
That handler ends with:

```js
if (!hash) {
  const scrollOptions = { top: 0, left: 0, behavior }
  if (!windowRestored) scrollTo(scrollOptions)
}
```

The initial page load is a navigation the router was never told otherwise about, so it resets the
window. Traced by trapping `window.scrollTo` and printing a stack for every call:

```
scrollTo([0,6235.625]) @488ms   ← the arrival effect, from commitHookPassiveMountEffects
scrollTo([{"top":0,"left":0}]) @525ms   ← the router, from RouterCore.emit ← commitHookLayoutEffects
```

Two properties make this worse than an ordering bug:

1. **There is no error and no warning.** The feature simply does nothing, and the page looks exactly
   as it would if the parameter were unread. Nothing in the type system, the linter or a component
   test can see it.
2. **It appears to work in development.** StrictMode double-invokes effects, which re-runs the
   arrival effect after the reset in some interleavings. The first version I wrote passed its own
   e2e spec against `vite dev` for exactly this reason; the check that mattered was a production
   build, where StrictMode is inert.

The router does have a first-class hook for "open at a position" — it skips the reset entirely when
the location carries a `#hash`, and calls `scrollIntoView` instead. That is unavailable to anything
addressing a position through a validated **search param**, which `domain` is and which the URL
contract for this feature requires.

## Fix Applied

`useDomainOnArrival` waits for the router to say it has rendered, then scrolls:

- It subscribes to `router.subscribe("onRendered", ...)` and only scrolls after that has fired.
  Subscribers are held in insertion order and the router's own reset was registered when the router
  was constructed, so a subscription made from a component is always **after** it.
- **The subscription is a `useLayoutEffect`, not a `useEffect`**, and that is load-bearing rather than
  a preference: the emit comes from `OnRendered`'s own layout effect, and `OnRendered` is a sibling
  rendered after the match the screen sits inside. React runs a commit's layout effects before any of
  its passive effects, so a passive subscription would be installed after the first emit — the only
  emit a plain arrival ever produces.
- The scroll is still gated on the anchors existing (`rendered.join(" ")` as the effect key), because
  a shared address carrying `fromId` seats its catalogue after the first paint and has nothing to
  scroll to when the router settles.

Verified in both builds: `?domain=infra` lands at `scrollY 15545` with the section flush under the
bar (gap 0 px) on `vite dev` and on `vite build --mode test` served by `vite preview`.

## Proposed Standard

A line for the editor's conventions — `packages/cli/CLAUDE.md` has no editor section, so the closest
existing home is `apps/editor`'s own routing code, and this finding proposes the rule live as a
docblock on `router.tsx` as well as here:

> The router owns the window's scroll position until it has emitted `onRendered`, and it resets it to
> the top on every navigation it was not passed `resetScroll: false` for — the initial load included.
> Anything that positions the page from the ADDRESS therefore has to wait for that event, and has to
> subscribe from a layout effect so it cannot miss the first one. A mount effect that scrolls is
> undone with no error, and StrictMode's double-invoke makes the broken version pass in development,
> so any such feature is verified against a production build before it is called done.

Cross-checked against CLAUDE.md's NEVER/ALWAYS rules: no conflict. It is an instance of the existing
"run it by hand and confirm it does what it claims" step in the repository's implementation process,
and it is worth recording precisely because that step is what caught it — the spec was green.
