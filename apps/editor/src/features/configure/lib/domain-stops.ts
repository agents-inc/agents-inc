/** How far the page is between two domains' stops: `t` 0 is on `index`, 1 is on the next. */
export type Progress = { index: number; t: number }

export type TabBox = { left: number; width: number }

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

// `count` evenly spaced values after `from`, the last of them `to`.
const spreadEvenly = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_, step) => lerp(from, to, (step + 1) / count))

/**
 * The scroll position at which each domain reaches the bar, clamped to the
 * page. Stops at or past the foot of the page are spread evenly between the
 * last reachable stop and the foot, so a short trailing section still gets a
 * turn.
 */
export const domainStops = (raw: readonly number[], max: number): number[] => {
  const stops = raw.map((stop) => Math.max(0, stop))
  const firstCollapsed = stops.findIndex((stop) => stop >= max)
  if (firstCollapsed === -1) return stops

  const reachable = stops.slice(0, firstCollapsed)
  const lastReachable = reachable.at(-1) ?? 0

  return [
    ...reachable,
    ...spreadEvenly(lastReachable, max, stops.length - firstCollapsed),
  ]
}

export const progressAt = (stops: readonly number[], y: number): Progress => {
  const passed = stops.findLastIndex((stop) => y >= stop)
  const index = Math.max(0, passed)
  const from = stops[index]
  const to = stops[index + 1]

  if (from === undefined || to === undefined || to <= from)
    return { index, t: 0 }
  return { index, t: clamp((y - from) / (to - from), 0, 1) }
}

/** A domain is current once the page is more than halfway to it. */
export const currentIndex = ({ index, t }: Progress) =>
  t > 0.5 ? index + 1 : index

export const indicatorBox = (
  tabs: readonly TabBox[],
  { index, t }: Progress
): TabBox | undefined => {
  const from = tabs[index]
  if (!from) return undefined
  const to = tabs[index + 1] ?? from

  return {
    left: lerp(from.left, to.left, t),
    width: lerp(from.width, to.width, t),
  }
}
