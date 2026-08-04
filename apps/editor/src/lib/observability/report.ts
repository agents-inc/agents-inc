// The one seam for "something went wrong in a way the user cannot see".
//
// Call sites name the failure and hand over context; they do not know what
// receives it. That is deliberate in both directions: modules like
// `github-skills.ts` stay free of a vendor import their unit tests would
// otherwise have to load, and replacing the service is one file.
export type IssueContext = Record<string, unknown>

export type ReportingSink = {
  issue: (message: string, context?: IssueContext) => void
  error: (error: unknown, context?: IssueContext) => void
}

const consoleSink: ReportingSink = {
  issue: (message, context) =>
    console.warn(`[issue] ${message}`, context ?? {}),
  error: (error, context) => console.error(error, context ?? {}),
}

// A visitor's console is not a monitoring channel, so production stays quiet
// until something is actually listening. Development keeps the warnings the
// store used to print itself.
const silentSink: ReportingSink = { issue: () => {}, error: () => {} }

let sink: ReportingSink = import.meta.env.DEV ? consoleSink : silentSink

export const setReportingSink = (next: ReportingSink) => {
  sink = next
}

export const reportIssue = (message: string, context?: IssueContext) =>
  sink.issue(message, context)

export const reportError = (error: unknown, context?: IssueContext) =>
  sink.error(error, context)
