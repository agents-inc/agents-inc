/**
 * A colour token as the page resolves it now, in the `rgb(…)` form a computed
 * style reports. Read through a throwaway element because the root reports a
 * custom property as declared, and `#d8d3c4` never equals `rgb(216, 211, 196)`.
 */
export const resolvedColor = (token: `--color-${string}`) => {
  const probe = document.createElement("span")
  probe.style.color = `var(${token})`
  document.body.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  return resolved
}
