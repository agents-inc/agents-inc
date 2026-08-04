import { loadSkillsMatrixFromSource, type SourceLoadResult } from "../../loading/index.js";
import {
  enableBuffering,
  drainBuffer,
  disableBuffering,
  type StartupMessage,
} from "../../../utils/logger.js";

export type LoadSourceOptions = {
  sourceFlag?: string;
  projectDir: string;
  forceRefresh?: boolean;
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
 * The caller (init/edit) passes these messages to the Wizard's <Static> block.
 *
 * @throws {Error} If source resolution or fetching fails.
 */
export async function loadSource(options: LoadSourceOptions): Promise<LoadedSource> {
  const { sourceFlag, projectDir, forceRefresh, captureStartupMessages } = options;

  if (captureStartupMessages) {
    enableBuffering();
  }

  let sourceResult: SourceLoadResult;
  try {
    sourceResult = await loadSkillsMatrixFromSource({
      sourceFlag,
      projectDir,
      forceRefresh,
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
