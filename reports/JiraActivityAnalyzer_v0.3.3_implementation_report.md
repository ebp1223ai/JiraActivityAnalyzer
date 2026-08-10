# Jira Activity Analyzer v0.3.3 實作報告

## 基線與範圍

- Baseline source/evidence HEAD：`4b0d0244a063a68fe96a281af83bcc6c6afaa956`。
- Source baseline：`05724206531834728a04a45dae9ba28f45b2f403`。
- Branch：`fix/v0.3.3-compact-diff-export-correctness`。
- SQLite schema 維持 v3；ENV format 未變更；沒有 migration、真實 Jira/SQLite 或 AI 功能。

## Root Cause

v0.3.2 的 Description path 會建立正式 `diffHunks`，但 non-Description classifier 只回傳 changed status 與 0/1 counts，serializer 因此只能輸出空 hunks。另一個分歧位於 `diffQuickFilterSql`：SQL path、progressive path 與 export 雖共享部分 classifier，SQL 排除條件仍保留舊的 nullable/unavailable 例外，造成 Query Snapshot 與 frozen records 不一致。

## 實作

- `shared/descriptionDiff.ts` 公開既有 deterministic line/hunk builder，Description 仍沿用原語意 parser 與有限 context。
- `shared/viewerEfficiency.ts` classifier v3 對 scalar、multiline、集合陣列、有序陣列、複合 JSON、Attachment/Link 建立 canonical lines 與正式 hunks。Object keys 排序；Labels 等集合排序；一般陣列保留順序；newline 固定 LF。
- Attachment/Link adapter 排除 local/temp/runtime path metadata；credential safety scan 仍 fail closed。
- missing/value 形成 insert-only 或 delete-only；null、empty string、empty array 使用不同 canonical 表示；Before availability 不被捏造。
- `shared/pendingAnalysisContract.ts` 升為 `0.3.3-draft.1`，強制 changed/substantive hunk 與 count invariant。缺漏以 public `EXPORT_INTEGRITY_FAILED` + typed `DIFF_CONTENT_MISSING` 終止。
- coverage 只在頂層 counts 保留一份：changed records、records with diff、hunk count、complete flag。Completed 必須 complete。
- SQL UDF、progressive Viewer 與 export 共用 classifier；四個 filters 採 AND 排除語意。Export snapshot 使用 normalized effective query。
- Export 完成前逐 batch 驗證 ordered IDs 與 frozen IDs 完全一致；筆數或順序不一致 fail closed。
- Final JSON 仍不包含 Before/After、beforeRaw/afterRaw、fromString/toString、oldValue/newValue 或其他全文 alias；diff 內容只存在正式 hunk lines。

## Quick Filter Truth Table

| Filter=true | 排除條件 |
|---|---|
| hideNoChange | isSubstantiveChange != true |
| hideZeroAdded | added count 為 null 或 <= 0 |
| hideZeroDeleted | removed count 為 null 或 <= 0 |
| hideBeforeUnavailable | beforeAvailable != true |

四個條件以 AND 套用；Viewer count、完整 progressive ID set、frozen export 共用同一語意。

## Delivery

- Clean packaged source commit：`b9ac0dbe9259619cbe8f3ef2109342ebbaeabf04`。
- Windows artifacts 位於 `F:\AI\JAA-v033-dist-b9ac0db\release`。
- package audit、runtime-path contamination scan 與 Portable 短啟動均通過；Artifacts 未簽章。
