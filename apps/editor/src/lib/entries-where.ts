export const entriesWhere = <T>(
  record: Readonly<Record<string, T>>,
  keeps: (key: string) => boolean
) => Object.fromEntries(Object.entries(record).filter(([key]) => keeps(key)))
