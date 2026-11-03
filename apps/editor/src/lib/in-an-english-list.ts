// Apart from `@workspace/compile`'s "and"-only twin, which first paint does not load.
export const inAnEnglishList = (
  items: readonly string[],
  conjunction: "and" | "or" = "and"
) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`
