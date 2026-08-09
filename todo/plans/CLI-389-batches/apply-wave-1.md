# Apply manifest — CLI-389 wave 1 (B9 mobile + B10 desktop), verified 2026-08-07

Everything below is settled and does NOT wait on the owner's api-data split decision
(`OWNER-DECISION-api-data-split.md`; B6 contributes zero rules to this wave). Sources: the
amended `B9-mobile.md` and `B10-desktop.md` manifest rows, every one sustained or corrected by
`verify-B9-B10.md`. Two files change, both in
`packages/cli/src/cli/lib/configuration/`: **default-rules.ts** (36 `requires` additions: 22
mobile + 14 desktop) and **default-categories.ts** (3 `exclusive` flips). After the edits, run
the generation round (`generate:types` + `generate:matrix`) so the matrix artifacts pick up the
changes.

Explicitly NOT in this wave: any B6/api-data change (owner decision pending); deletion of the
`{electron, tauri}` conflict group, the `{expo, react-native}` compatibleWith group, or any
other conflict group (decision 2 Phase C / decision 4a own those); the requires-closure in
`packages/matrix` (EDITOR-11); the bullmq binding (handed to B5 — B6-api-data.md F4).

## Ordering constraints (hard)

1. **B10:** the 14 desktop `requires` rules land BEFORE or in the SAME change as the
   `desktop-multiwindow`/`desktop-security` flips — never between (B10 disposition F: those two
   pairs would be briefly fenceless).
2. **B9:** the `mobile-testing` flip is a pure loosening (no fenceless window), but land it in
   the same change as the detox/maestro rules (B9 disposition G).
3. The multi-hop chains (expo-router → expo → react-native → react) must not become
   verdict-load-bearing before the shared requires-closure lands (EDITOR-11). The flat
   `needsAny` lists are written to be correct without closure — do not "simplify" them by
   removing react-native where expo appears.

## default-rules.ts — 36 additions to the requires block

House shape (matches the existing entries, e.g. `expo`/`react-native` at default-rules.ts
493-502): multi-line object `{ skill, needs, needsAny?, reason }`. One-line forms below carry
the exact content; reformat to the file's multi-line style. Example expansion of row 1:

```ts
{
  skill: "react-navigation",
  needs: ["react-native", "expo"],
  needsAny: true,
  reason: "React Navigation targets React Native apps, bare or Expo",
},
```

### B9 — mobile (22 rules)

| #   | addition (exact content)                                                                                                                                                     | source row                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `{ skill: "react-navigation", needs: ["react-native", "expo"], needsAny: true, reason: "React Navigation targets React Native apps, bare or Expo" }`                         | B9 react-navigation                                                                                                                                |
| 2   | `{ skill: "expo-router", needs: ["expo"], reason: "Expo Router is built on the Expo SDK" }`                                                                                  | B9 expo-router                                                                                                                                     |
| 3   | `{ skill: "nativewind", needs: ["react-native", "expo"], needsAny: true, reason: "NativeWind compiles Tailwind classes for React Native components" }`                       | B9 nativewind (deliberately NO `tailwind` member — verify item 11: NativeWind v4 uses Tailwind v3 config, the catalog's tailwind skill teaches v4) |
| 4   | `{ skill: "unistyles", needs: ["react-native", "expo"], needsAny: true, reason: "Unistyles styles React Native via Nitro Modules" }`                                         | B9 unistyles                                                                                                                                       |
| 5   | `{ skill: "detox", needs: ["react-native", "expo"], needsAny: true, reason: "Detox is gray-box E2E testing for React Native" }`                                              | B9 detox                                                                                                                                           |
| 6   | `{ skill: "maestro", needs: ["react-native", "expo", "tauri-mobile"], needsAny: true, reason: "Maestro drives a mobile app; these are the catalog's mobile-app producers" }` | B9 maestro — WIDENED form (verify item 1); the pair-only form is superseded                                                                        |
| 7   | `{ skill: "tamagui", needs: ["react-native", "expo", "react"], needsAny: true, reason: "Tamagui is universal React: native via RN or Expo, web via React alone" }`           | B9 tamagui — WIDENED form (verify item 2); the pair-only form is superseded                                                                        |
| 8   | `{ skill: "react-native-paper", needs: ["react-native", "expo"], needsAny: true, reason: "React Native Paper is Material Design 3 for React Native" }`                       | B9 react-native-paper                                                                                                                              |
| 9   | `{ skill: "reanimated", needs: ["react-native", "expo"], needsAny: true, reason: "Reanimated animates React Native via worklets" }`                                          | B9 reanimated                                                                                                                                      |
| 10  | `{ skill: "gesture-handler", needs: ["react-native", "expo"], needsAny: true, reason: "Gesture Handler replaces React Native's gesture system" }`                            | B9 gesture-handler                                                                                                                                 |
| 11  | `{ skill: "skia", needs: ["react-native", "expo"], needsAny: true, reason: "@shopify/react-native-skia is a React Native renderer" }`                                        | B9 skia                                                                                                                                            |
| 12  | `{ skill: "mmkv", needs: ["react-native", "expo"], needsAny: true, reason: "react-native-mmkv is a React Native storage package" }`                                          | B9 mmkv                                                                                                                                            |
| 13  | `{ skill: "sqlite-powersync", needs: ["react-native", "expo"], needsAny: true, reason: "The skill teaches PowerSync's React Native SDK" }`                                   | B9 sqlite-powersync                                                                                                                                |
| 14  | `{ skill: "watermelondb", needs: ["react-native", "expo"], needsAny: true, reason: "WatermelonDB as taught targets offline-first React Native apps" }`                       | B9 watermelondb                                                                                                                                    |
| 15  | `{ skill: "eas", needs: ["expo"], reason: "EAS Build/Update workflows assume the Expo SDK" }`                                                                                | B9 eas (verify item 4: `[expo]` honestly covers even the bare-RN EAS path)                                                                         |
| 16  | `{ skill: "vision-camera", needs: ["react-native", "expo"], needsAny: true, reason: "react-native-vision-camera depends on React Native's JSI" }`                            | B9 vision-camera                                                                                                                                   |
| 17  | `{ skill: "ble-nfc", needs: ["react-native", "expo"], needsAny: true, reason: "Both taught libraries are React Native packages" }`                                           | B9 ble-nfc                                                                                                                                         |
| 18  | `{ skill: "push", needs: ["react-native", "expo"], needsAny: true, reason: "Dual-path: expo-notifications or React Native Firebase messaging" }`                             | B9 push                                                                                                                                            |
| 19  | `{ skill: "tasks", needs: ["react-native", "expo"], needsAny: true, reason: "Dual-path: Expo background tasks or react-native-background-fetch" }`                           | B9 tasks                                                                                                                                           |
| 20  | `{ skill: "app-links", needs: ["react-native", "expo"], needsAny: true, reason: "Deep linking via expo-linking or React Navigation linking config" }`                        | B9 app-links                                                                                                                                       |
| 21  | `{ skill: "react-native-performance", needs: ["react-native", "expo"], needsAny: true, reason: "React Native performance patterns: Hermes, threads, FlashList" }`            | B9 react-native-performance                                                                                                                        |
| 22  | `{ skill: "react-native-security", needs: ["react-native", "expo"], needsAny: true, reason: "Dual-path secure storage: expo-secure-store or react-native-keychain" }`        | B9 react-native-security                                                                                                                           |

No rules for the two anchors: `react-native` and `expo` already carry theirs
(default-rules.ts 493-502).

### B10 — desktop (14 rules)

| #   | addition (exact content)                                                                                                    | source row                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 23  | `{ skill: "electron-ipc", needs: ["electron"], reason: "contextBridge/ipcMain are Electron core APIs" }`                    | B10 electron-ipc                                                                                                                 |
| 24  | `{ skill: "electron-storage", needs: ["electron"], reason: "electron-store and safeStorage are Electron-scoped" }`          | B10 electron-storage                                                                                                             |
| 25  | `{ skill: "electron-ui", needs: ["electron"], reason: "Tray, Menu, and frameless windows are Electron core APIs" }`         | B10 electron-ui                                                                                                                  |
| 26  | `{ skill: "electron-testing", needs: ["electron"], reason: "Playwright's _electron driver automates Electron apps" }`       | B10 electron-testing (deliberately NOT `requires [playwright-e2e]` — verify item 17: the driver ships in the playwright package) |
| 27  | `{ skill: "electron-updater", needs: ["electron"], reason: "electron-updater updates packaged Electron apps" }`             | B10 electron-updater (the electron-builder/Squirrel nuance is a D-306 record, not a rule)                                        |
| 28  | `{ skill: "electron-multiwindow", needs: ["electron"], reason: "BaseWindow and WebContentsView are Electron core APIs" }`   | B10 electron-multiwindow                                                                                                         |
| 29  | `{ skill: "electron-security", needs: ["electron"], reason: "Fuses, ASAR integrity, and sandbox are Electron mechanisms" }` | B10 electron-security                                                                                                            |
| 30  | `{ skill: "electron-forge", needs: ["electron"], reason: "Electron Forge packages Electron apps" }`                         | B10 electron-forge                                                                                                               |
| 31  | `{ skill: "tauri-backend", needs: ["tauri"], reason: "tauri::command and State are the tauri crate" }`                      | B10 tauri-backend                                                                                                                |
| 32  | `{ skill: "tauri-bundling", needs: ["tauri"], reason: "Tauri bundler, signer, and updater configuration" }`                 | B10 tauri-bundling                                                                                                               |
| 33  | `{ skill: "tauri-plugins", needs: ["tauri"], reason: "tauri-plugin-* crates and the Tauri 2 ACL model" }`                   | B10 tauri-plugins                                                                                                                |
| 34  | `{ skill: "tauri-multiwindow", needs: ["tauri"], reason: "Tauri 2 event system and WebviewWindow APIs" }`                   | B10 tauri-multiwindow                                                                                                            |
| 35  | `{ skill: "tauri-security", needs: ["tauri"], reason: "Capabilities and permissions are the Tauri 2 security model" }`      | B10 tauri-security                                                                                                               |
| 36  | `{ skill: "tauri-mobile", needs: ["tauri"], reason: "Tauri mobile targets are the same Tauri project" }`                    | B10 tauri-mobile (verify item 23: no react-native/expo relationship)                                                             |

No rules for the two anchors: `electron` and `tauri` are frontend-framework-agnostic and
correctly carry none (verify item 22).

The `needs` members are slugs exactly as the batch rows use them; verify each against the
generated slug→id map before landing (`packages/cli/src/cli/types/generated/source-types.ts`).
Reasons are drafted here in house style — content is load-bearing, exact wording is not.

## default-categories.ts — 3 exclusivity flips, 1 explicit keep

| category              | edit                                    | source                                                                                                                                                                  |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile-testing`      | `exclusive: true` → `exclusive: false`  | B9 disposition D (amended), verify item 3: Detox (gray-box) and Maestro (black-box) are different kinds that layer; both stay mobile-fenced via their requires rules    |
| `desktop-multiwindow` | `exclusive: true` → `exclusive: false`  | B10 disposition B, verify item 19: the framework fence carries the exclusion; windowing guides compose                                                                  |
| `desktop-security`    | `exclusive: true` → `exclusive: false`  | B10 disposition C, verify item 20: same mechanism; hardening guides compose                                                                                             |
| `desktop-packaging`   | **NO CHANGE — stays `exclusive: true`** | B10 disposition D, verify item 16: one packaging pipeline per app is a real pick-one fact, and the radio becomes the only fence if an electron-builder skill ever joins |

No other category, rule, or generated file is touched in this wave.
