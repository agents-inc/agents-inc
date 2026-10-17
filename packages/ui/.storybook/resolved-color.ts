/** Via a throwaway element: the root reports a custom property as declared, not as `rgb(…)`. */
export const resolvedColor = (token: `--color-${string}`) => {
  const probe = document.createElement("span")
  probe.style.color = `var(${token})`
  document.body.append(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  return resolved
}
