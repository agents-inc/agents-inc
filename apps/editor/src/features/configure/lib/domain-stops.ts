// `t` 0 is on `index`, 1 is on the next.
export type Progress = { index: number; t: number }

export type TabBox = { left: number; width: number }

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const spreadEvenly = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_, step) => lerp(from, to, (step + 1) / count))

// Stops past the page's foot are spread evenly up to it, so a short trailing
// section still gets a turn.
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
