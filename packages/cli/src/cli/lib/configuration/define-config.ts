import type { ProjectConfig } from "../../types";

/** Define the config inline: extracting it to a variable widens its literal types. */
export function defineConfig<const T extends ProjectConfig>(config: T): T {
  return config;
}
