/**
 * The seed decode lives in `@workspace/compile/seed-to-config`, beside the config builders it
 * feeds — the editor authors these payloads and the CLI installs them, so one decode is the whole
 * point. Re-exported here under the name every CLI call site reads it by.
 */
export { seedToWizardResult, type SeedMapping } from "@workspace/compile/seed-to-config";
