/** Each step starts once the one before it has settled; results keep the items' order. */
export async function mapInTurn<Item, Result>(
  items: readonly Item[],
  step: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  return items.reduce<Promise<Result[]>>(
    async (earlier, item) => [...(await earlier), await step(item)],
    Promise.resolve([]),
  );
}
