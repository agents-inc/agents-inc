---
type: anti-pattern
severity: medium
affected_files:
  - /home/vince/dev/skills/src/skills/desktop-plugins-tauri/examples/mobile.md
  - /home/vince/dev/skills/src/skills/desktop-plugins-tauri/examples/data-storage.md
  - /home/vince/dev/skills/src/skills/desktop-plugins-tauri/examples/system.md
  - /home/vince/dev/skills/src/skills/desktop-plugins-tauri/reference.md
  - /home/vince/dev/skills/src/skills/desktop-mobile-tauri/examples/plugins.md
  - /home/vince/dev/skills/src/skills/desktop-mobile-tauri/reference.md
standards_docs: []
date: 2026-04-03
reporting_agent: skill-summoner
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: skill content fixes applied in skills repo
---

## What Was Wrong

Six API accuracy issues found across Tauri desktop domain skills during quality review:

1. **Barcode scanner `Format` enum values**: Skills used `Format.QRCode` and `Format.EAN13` (PascalCase) but the actual Tauri plugin uses `Format.QR_CODE` and `Format.EAN_13` (SCREAMING_SNAKE_CASE).

2. **Biometric plugin imports**: Skills imported `BiometryType` and `checkStatus` which are not documented exports of `@tauri-apps/plugin-biometric`. The plugin only exports `authenticate` and permission helpers.

3. **Haptics plugin enum imports**: Skills imported `ImpactFeedbackStyle` and `NotificationFeedbackType` enums, but the actual API takes plain string arguments (`"medium"`, `"success"`).

4. **NFC plugin API**: Skills used `scan()` with no args and expected `tag.id` / `tag.records` shape. Actual API uses `scan({ type: "tag", keepSessionAlive: ... })` and has `write()` / `textRecord()` / `uriRecord()` helper functions.

5. **Store plugin import**: Skill used `import { load } from "@tauri-apps/plugin-store"` but the current API uses `import { Store } from "@tauri-apps/plugin-store"` with `Store.load()` as a static method.

6. **Stronghold plugin Rust setup**: Skill used `Builder::with_argon2(&salt_path)` but the actual API is `Builder::new(|password| { ... })` with a manual password hashing closure.

7. **Dialog plugin platform**: Skill marked dialog as "Desktop" only but it works on mobile for file selection (folder picker is desktop-only).

## Fix Applied

All issues fixed directly in the affected skill files. Import paths, enum values, function signatures, and platform support tables corrected to match current Tauri v2 APIs.

## Proposed Standard

Skills that wrap specific library APIs should be verified against the library's current documentation (via Context7 or official docs) before merging. A checklist item for "API import paths and function signatures verified against current docs" should be added to the skill authoring process.
