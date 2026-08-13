# JiraActivityAnalyzer v0.3.14 Packaging Report

## Build identity

- Version: 0.3.14
- Build time: 2026/08/13 11:50:01 (2026-08-13T03:50:01.670Z)
- Artifact source commit: `cb395c00a37e267c8bccffc406c79f592511f944`
- Branch: `feat/v0.3.14-ai-request-transparency-conversation-persistence-response-contract-alignment`
- `build-info.json dirtyState`: true，唯一 tracked dirty 是使用者既有且未提交的 v0.2.47 report；v0.3.14 source 已在上述 commit，且 electron-builder `files` 不包含 reports。

## Artifacts

| Artifact | Bytes | MiB | SHA-256 | Version | Signature |
|---|---:|---:|---|---|---|
| `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Setup 0.3.14.exe` | 190,516,339 | 181.691 | `6d065048bd72de261101abd710dd891599579a27465f958841a567f864371310` | 0.3.14 | NotSigned |
| `F:\AI\JiraActivityAnalyzer\release\Jira Activity Analyzer Portable 0.3.14.exe` | 190,286,246 | 181.471 | `79cf7c58c2c21778cb192820606bffab2135278fc1ae2c14b4bbaa77537c2486` | 0.3.14 | NotSigned |
| `F:\AI\JiraActivityAnalyzer\release\win-unpacked\Jira Activity Analyzer.exe` | 235,706,368 | 224.787 | `45dfb123899e091e32d9419b8010d6bc37aa8858ee322d39f4d0db010489c32b` | 0.3.14 | NotSigned |
| `F:\AI\JiraActivityAnalyzer\release\win-unpacked\resources\app.asar` | 24,735,928 | 23.590 | `b974fc26dc397f7beb2701480954b73a59c9e8a014f8438885e3e47583d2efab` | N/A | N/A |

## Portable launch

正式 Portable 於 2026-08-13 11:53:55 +08:00 啟動。session `app-session-1786593247868-e44a25` 記錄：

- main `session_started`；
- renderer `renderer_boot`，route `#/`，readyState `interactive`；
- main `did-finish-load`，載入 packaged `app.asar/dist/index.html`；
- Build version 0.3.14、Build time 2026/08/13 11:50:01、commit `cb395c0...`；
- `did-fail-load` / `render-process-gone` / renderer crash / fatal matches = 0。

程序於驗證後由測試命令關閉。未連線 Jira、AI 或 SQLite。

## Warnings

- Vite renderer chunk 824.85 kB 超過 500 kB建議值：效能建議，不影響 renderer load、Run persistence 或 response assembly。
- `shared/descriptionDiff.ts` 的 `node:crypto` 被 Vite browser build externalize：既有 warning；Electron-main hashing使用 `node:crypto`，本版 request/archive/response hash 不在 renderer 執行。
- electron-builder 使用 default Electron icon：外觀 warning。
- EXE 未 Authenticode 簽章：交付風險，未宣稱已簽章。
- duplicate dependency references：packaging optimization warning，產物成功。