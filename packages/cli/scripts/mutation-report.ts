/**
 * Reads the `mutation.json` Stryker's json reporter writes (`reports/mutation/mutation.json` at the
 * repository root): the fields the mutation-testing scripts read, and nothing else.
 */
import { readFileSync } from "fs";

import { z } from "zod";

/** Every status a finished run gives a mutant; `Pending` means the run did not finish. */
export const MUTANT_STATUSES = [
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "Ignored",
  "CompileError",
  "RuntimeError",
] as const;

export type MutantStatus = (typeof MUTANT_STATUSES)[number];

/** Lines and columns count from 1. */
const PositionSchema = z.object({ line: z.number(), column: z.number() });

const LocationSchema = z.object({ start: PositionSchema, end: PositionSchema });

const MutantSchema = z.object({
  mutatorName: z.string(),
  replacement: z.string(),
  status: z.enum(MUTANT_STATUSES),
  static: z.boolean().exactOptional(),
  testsCompleted: z.number().exactOptional(),
  /** Test ids, which only this report's `testFiles` resolves: ids are numbered afresh each run. */
  coveredBy: z.array(z.string()).exactOptional(),
  location: LocationSchema,
});

const ReportedFileSchema = z.object({ source: z.string(), mutants: z.array(MutantSchema) });

const ReportedTestFilesSchema = z.record(
  z.string(),
  z.object({ tests: z.array(z.object({ id: z.string(), name: z.string() })) }),
);

const MutationReportSchema = z.object({
  /** Keyed by path from the repository root. */
  files: z.record(z.string(), ReportedFileSchema),
  testFiles: ReportedTestFilesSchema,
  /** The config the run resolved, `--mutate` ranges included. */
  config: z.object({ mutate: z.array(z.string()) }),
});

export type MutantLocation = z.infer<typeof LocationSchema>;
export type Mutant = z.infer<typeof MutantSchema>;
export type ReportedFile = z.infer<typeof ReportedFileSchema>;
export type ReportedTestFiles = z.infer<typeof ReportedTestFilesSchema>;
export type MutationReport = z.infer<typeof MutationReportSchema>;

export function readMutationReport(reportFile: string): MutationReport {
  const parsed = MutationReportSchema.safeParse(JSON.parse(readFileSync(reportFile, "utf-8")));
  if (!parsed.success) {
    throw new Error(
      `${reportFile} is not a finished Stryker mutation.json: ${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}

/** Each mutant beside the file that holds it, in the report's order. */
export function mutantsOf(report: MutationReport): Array<{ file: string; mutant: Mutant }> {
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants.map((mutant) => ({ file, mutant })),
  );
}
