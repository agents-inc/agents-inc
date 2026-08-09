import { loadSkillsMatrixFromSource, type SourceLoadResult } from "../../loading/index.js";
import type { SourceCaller } from "../../configuration/index.js";
import {
  enableBuffering,
  drainBuffer,
  disableBuffering,
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
