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
  caller?: SourceCaller;
  sourceFlag?: string;
  projectDir: string;
  /** Captures warn() output during the load instead of writing it to stderr. */
  captureStartupMessages?: boolean;
};

export type LoadedSource = {
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[];
};

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

export function sayCapturedWarnings(messages: readonly StartupMessage[]): void {
  for (const { text } of messages) warn(text);
}
