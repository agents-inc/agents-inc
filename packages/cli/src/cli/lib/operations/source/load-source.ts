import { loadSkillsMatrixFromSource, type SourceLoadResult } from "../../loading/index.js";
import type { SourceCaller } from "../../configuration/index.js";
import {
  enableBuffering,
  drainBuffer,
  disableBuffering,
  warn,
  type StartupMessage,
} from "../../../utils/logger.js";

export type LoadSourceOptions = {
  /** Whether this load may reach the init-time source rungs — see {@link SourceCaller}. */
  caller?: SourceCaller;
  sourceFlag?: string;
  projectDir: string;
  /** When true, enables message buffering and captures startup messages. Default: false. */
  captureStartupMessages?: boolean;
};

export type LoadedSource = {
  sourceResult: SourceLoadResult;
  /** Empty array when captureStartupMessages is false. */
  startupMessages: StartupMessage[];
};

/**
 * Loads the skills matrix from a resolved source.
 *
 * When `captureStartupMessages` is true, wraps the load in buffer mode so
 * warn() calls during loading are captured instead of written to stderr.
 * The caller (init/edit) hands them to the wizard, which paints them as a band
 * above the step — stderr does not survive the wizard clearing the terminal.
 *
 * @throws {Error} If source resolution or fetching fails.
 */
export async function loadSource(options: LoadSourceOptions): Promise<LoadedSource> {
  const { caller, sourceFlag, projectDir, captureStartupMessages } = options;

  if (captureStartupMessages) {
    enableBuffering();
  }

  let sourceResult: SourceLoadResult;
  try {
    sourceResult = await loadSkillsMatrixFromSource({
      ...(caller !== undefined && { caller }),
      ...(sourceFlag !== undefined && { sourceFlag }),
      projectDir,
    });
  } catch (error) {
    if (captureStartupMessages) {
      disableBuffering();
    }
    throw error;
  }

  let startupMessages: StartupMessage[] = [];
  if (captureStartupMessages) {
    startupMessages = drainBuffer();
    disableBuffering();
  }

  return { sourceResult, startupMessages };
}

/**
 * Says what a captured load held back, for a run that mounts no wizard to paint it.
 *
 * Capture exists for the wizard alone: its first repaint wipes stderr, so `warn()` is held and
 * painted as the startup band instead. A `--from` run loads through the same capture and mounts no
 * wizard, so what was held went nowhere — a skill skipped for a file that will not parse, two
 * folders claiming one id, a marketplace served from a stale cache. They are said here in the
 * words `compile` prints them in. Only the warnings: an `info` line is the band's own narration.
 */
export function sayCapturedWarnings(messages: readonly StartupMessage[]): void {
  for (const { level, text } of messages) {
    if (level === "warn") warn(text);
  }
}
