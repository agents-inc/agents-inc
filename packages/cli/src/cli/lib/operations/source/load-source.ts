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
  const load = () =>
    loadSkillsMatrixFromSource({
      ...(caller !== undefined && { caller }),
      ...(sourceFlag !== undefined && { sourceFlag }),
      projectDir,
    });

  if (!captureStartupMessages) return { sourceResult: await load(), startupMessages: [] };
  return capturingStartupMessages(load);
}

/** Buffering ends with the load, whether it lands or throws. */
async function capturingStartupMessages(
  load: () => Promise<SourceLoadResult>,
): Promise<LoadedSource> {
  enableBuffering();
  try {
    const sourceResult = await load();
    return { sourceResult, startupMessages: drainBuffer() };
  } finally {
    disableBuffering();
  }
}

export function sayCapturedWarnings(messages: readonly StartupMessage[]): void {
  for (const { text } of messages) warn(text);
}
