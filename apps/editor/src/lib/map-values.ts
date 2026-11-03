export const mapValues = <T, U>(
  record: Readonly<Record<string, T>>,
  to: (value: T) => U
) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]): [string, U] => [key, to(value)])
  )
