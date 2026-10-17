// The one seam for failures the user cannot see; call sites never import a
// vendor.
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

// Production stays quiet until a sink is installed.
const silentSink: ReportingSink = { issue: () => {}, error: () => {} }

let sink: ReportingSink = import.meta.env.DEV ? consoleSink : silentSink

export const setReportingSink = (next: ReportingSink) => {
  sink = next
}

export const reportIssue = (message: string, context?: IssueContext) =>
  sink.issue(message, context)

export const reportError = (error: unknown, context?: IssueContext) =>
  sink.error(error, context)
