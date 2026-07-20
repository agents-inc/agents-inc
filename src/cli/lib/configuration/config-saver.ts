import { loadProjectSourceConfig } from "./config";
import { writePartialProjectConfig } from "./config-writer";

export async function saveSourceToProjectConfig(
  projectDir: string,
  source: string,
  name: string,
): Promise<void> {
  const existing = (await loadProjectSourceConfig(projectDir)) ?? {};

  // config-saver invents a name (from the project dir) when none exists.
  await writePartialProjectConfig(projectDir, { ...existing, source }, { fallbackName: name });
}
