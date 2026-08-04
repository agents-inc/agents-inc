import type { ProjectConfig } from "../../types";

/**
 * Type-safe config helper for project configuration.
 * Uses const generics so literal types are preserved through the call.
 *
 * Config MUST be defined inline for full type inference --
 * extracting the object to a variable widens literal types.
 */
export function defineConfig<const T extends ProjectConfig>(config: T): T {
  return config;
}
