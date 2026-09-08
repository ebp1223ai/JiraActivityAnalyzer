# v0.3.44 Implementation Report

Status: IN_PROGRESS. No v0.3.44 EXE has been produced. Manual GUI gate: PENDING. Tag / Push: NOT RUN.

## Baseline And Preservation

- Baseline branch: `feat/v0.3.43-results-consistency-filters-ui`.
- Baseline HEAD: `5e33102dda866b7a19e02415ab6882bc218b86a2`.
- Current branch: `feat/v0.3.44-integrated-stability-auto-diagnostics`.
- Preserve the pre-existing v0.2.47 report modification and every original untracked item. They are not implementation inputs or staging candidates.
- Protected report SHA256: `9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d`.
- Windows event records: NOT_FOUND_REPORTED_BY_USER. This does not block synthetic investigation.
- Source / report commit: not yet created. No Tag, Push, PR or GitHub Release authorized before the named GUI gate.

## Findings

The v0.3.43 incident remains **UNCONFIRMED** as an exact crash cause. Three candidate sessions ended on `/integrated-results` while still marked running; legacy logs have no query-stage evidence. No original Raw database was supplied. Synthetic results do not establish the original exception or dataset size.

Confirmed code risks and repairs:

1. `electron/aiResultsQueryV043.ts` performed complete snapshot construction synchronously in main. `aiResultsServiceV044.ts` and `aiResultsWorkerV044.ts` move read execution off the main event loop; complete field discovery remains unbounded by row samples, but cell indexing is lazy for requested filters/sort/facets.
2. The old snapshot duplicated all dynamic field values for every record. Page materialization now resolves requested dynamic columns only. Full-scope export iterates the immutable snapshot and writes in the worker, preserving the old JSON/CSV contract.
3. `src/state/RuntimeStatusContext.tsx` allowed an initial, older `getState()` response to replace a newer subscription update. Subscription-first revision handling fixes the observed empty Raw identity and stale-result rejection without weakening identity validation.
4. Creating an empty WAL during a read changed the file signature. Zero-byte WAL files no longer invalidate unchanged data; nonempty WAL changes remain part of the key.
5. Read cancellation waits for actual worker termination. Write cancellation is cooperative, with rollback before commit and an explicit commit barrier. Relink preserves completed append-only attempts.
6. The old Playwright Electron launcher injects its own `ready` loader and missed startup console errors. The new UI harness uses normal Electron spawn and an explicitly isolated, nonce-gated test controller plus CDP. Production isolation remains enabled. New successful UI evidence has no startup console errors, page errors or renderer crashes.
7. The 5,544-byte ASAR fixture is `node_modules/json-schema-traverse/spec/fixtures/schema.js`, SHA256 `0262591e321bc88b22dc33ec78bcded5ab664e2fce2c10b9e0c35d3eb6030d27`. The exact `spec/**` exclusion preserves runtime `index.js`, native modules and license files. Temporary ASAR preflight passed; final packaged ASAR remains a separate gate.

## Automatic Diagnostics

`automaticDiagnosticsV044.ts` owns bounded IPC to an independent `diagnosticWriterV044.ts` process. Critical events require write/fsync acknowledgement, with bounded degradation rather than a UI hang on unavailable storage. Main and renderer heartbeat observations, memory samples, rotation, retention, redaction, incomplete-session recovery and previous-session export are implemented outside AI/Raw databases.

Read-worker stage envelopes carry worker producer IDs, sequence numbers and causal span IDs. START/END acknowledgement precedes further synchronous worker execution. Main IPC operations are wrapped at registration; actual snapshot, index, SQL, row mapping and export stages are recorded. Renderer commit observations are explicitly main-observed renderer events, not misrepresented as independent renderer-process producers.

Observed Windows behavior: abrupt main exit can kill the writer before its disconnect handler executes. Recovery therefore treats a durable `running` session whose instance is no longer live as unclean. It does not require a fictitious final error record. A crashed/blocked process and a confirmed exception are separate classifications.

## Input And Contract Verification

- ZIP extracted outside repository; 92 SHA256 entries verified.
- Input validator: 468 PASS, 0 FAIL.
- Frozen DDL validator: PASS, 279 catalog entries. Initial Python console encoding failure was retained; rerun with UTF-8 passed.
- Incident evidence validator: PASS, 17 checks, 3 candidate sessions and 1 unpacked session.
- Observability schema validator: 5 positive and 6 negative cases PASS.
- Frozen Package, SourceTrace, Rules, Template, Catalog, Workbench and AI DDL are not changed by this implementation.

## Remaining Gates

This report is intentionally not a completion claim. The acceptance matrix, all-route/internal-job coverage, extended UI and fault evidence, I/O/retention audits, final source gate, candidate packaging, relocation/install verification, artifact hashes and manual GUI result must be finalized before release. Input validators are not App test results.

## 續接修正（2026-09-08）

- 補上 source-read、mapping-aggregation、field-discovery 的實際 streaming span。三者部分重疊，耗時不可相加；不為每列建立 span。
- 啟用範圍的檔案操作改用局部 businessIoDiagnosticsV044 facade，保留原同步／Promise／callback 行為、不修改 Node 全域 fs。記錄實際 path、operation、phase 與錯誤碼，不記內容。重複低階操作合併，避免逐 chunk 洪水；Node API 觀測不宣稱 OS syscall tracing。
- Main、查詢／寫入／Viewer／Export worker 的觀測沿用既有 command context。診斷 writer 自身與 bootstrap 以既有路徑預檢／writer health 處理，不遞迴寫自己的 I/O。
- 額度耗盡後可清理 active session 已完成的舊分片；保留 open-span 所在分片與摘要，標示 timeline partial 並記錄清理。CrashReporter 未啟用，沒有新增原生 dump 生產流程。
- 移除封裝腳本持續 EPERM 後對未驗證目標遞迴刪除的 fallback，bounded retry 失敗即保留現場並停止。
- Coverage audit 區分所有啟用入口的 instrumentation 與實際執行覆蓋；不要求或宣稱逐函式／逐列 trace，也未呼叫真實 Jira／AI。
- R44-01～18 與延續 R43-01～15 的追蹤表列於 Acceptance.json。來源 Gate、封裝及人工 GUI 結果以最新 JSON 報告為準；本文件不是 GUI PASS 聲明。

### 最後來源修正

正常關閉加入 bounded drain，停止接收新業務 IPC，再等既有命令與 critical ACK。未完成的 renderer commit 明確 CANCELLED，晚到 END 不重複；超時未完成工作不偽報正常關閉。

新增 streaming 觀測後曾量測 18.621% overhead（FAIL，證據保留）。重用 NDJSON handle、移除逐 span 重複摘要 rename，critical journal 仍每筆 fsync。摘要定期／結束 atomic 保存，啟動從 authoritative journal 重播。重測 9.30%（PASS，硬體與原始五組數值見 Test Report）。
