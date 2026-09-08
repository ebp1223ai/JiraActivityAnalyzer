# JiraActivityAnalyzer v0.3.45 實作與交付報告

狀態：Partial / Release Blocked / Manual GUI Validation Pending。另有測試覆蓋缺口，詳見 Acceptance；不宣稱全部 Gate PASS。

## 實作範圍

- 整合結果從 Raw current_issue_snapshots 取得 Issue Type／目前 Status／Priority；Raw 母體與唯一 AI link 不變。
- AI 新預設隱藏無來源固定欄，保留手動與來源不明旧偏好及動態 schema。
- 結果／進行中 promise 快取有界；以 SQLite committed revision 與 active AI fingerprint 失效，非檔案 mtime。
- 查詢與匯出重用 executor/snapshot；完整符合列串流匯出，發布前檢查同一 DB revision。
- snapshot 不再重複存 row/document；quick filter 索引按需建立；cache bytes/owner 可追查。
- writer cutoff 同時複製 journal/summary 並核對 counts/watermarks/hash；legacy eventCounts 在委派 writer 後恢復更新。
- 未更動 Package2.0.0/2.0.1、DDL2.0.0、SourceTrace、Frozen Bridge或分類規則。

## 根因與證據

已確認：Raw欄位未連 current snapshot；mtime偏好/快取scope造成失效；unmount取消查詢；export獨立lane重新建立全量snapshot；documents重複存資料與未啟用索引；legacy sink委派後摘要不更新、debug collector未收新automatic journal。
未確認：私有紀錄RSS成長不等於已證實leak；67,032ms不是已確認匯出本體時間。未提供真實Raw DB，沒有掃描公司DB或連線Jira。

## 驗證

- T45-01 PASS：Current Raw join, cross-DB values, SQL/filters/facets; true user Raw DB was not supplied.
- T45-02 PASS：Raw base, absent AI and orphan/SQL-error regression; frozen importer/link projection retained.
- T45-03 PARTIAL：New AI defaults verified in actual UI. Explicit/unknown legacy selections preserved by source logic; exhaustive old-preference UI migration matrix not separately executed.
- T45-04 PASS：10001st tail and 100k complete fields/facets; typed array OR/AND and selected-zero current-source oracles.
- T45-05 PARTIAL：Production date/filter boundary oracles passed; actual UI Actor exact filter passed. All calendar interaction combinations were not separately repeated.
- T45-06 PASS：Current-source shared Diff/Trace immutability and frozen active projection oracles; no formatter/manual contract changes.
- T45-07 PARTIAL：Five real A-B-A restores <=1000ms and zero query jobs; filter retained. Every width/order/page/scroll combination is not exhaustively UI-tested.
- T45-08 PARTIAL：Real service pending promise reconnect, one job and bounded cache verified. Mid-flight renderer route stress/late response matrix not separately exhaustive.
- T45-09 PASS：WAL external commit/finding edit, readonly/timestamp/rollback, protected/no-op import revision assertions.
- T45-10 PASS：Real cross-DB query isolation and bounded actual cache entries/bytes; release reasons emitted by query worker.
- T45-11 PASS：Five real UI exports with 40 matching/17 columns around32KiB; service page20 still exports40; picker span separately recorded.
- T45-12 PASS：JSON/CSV x visible/all;39281 rows not page-limited and current-source complete membership/sort oracle.
- T45-13 PARTIAL：Same snapshot/export lane and worker cancellation checked; main checks revision before publication. Full picker/race/UI-cancel combination not separately repeated.
- T45-14 PASS：Original text and JSON/CSV contract equality; unchanged quoted JSON CSV encoding prevents direct formula cells.
- T45-15 PARTIAL：20 query/filter and20 cancel cycles; single process RSS not summed over worker threads; bounded pending/executors. Combined tab/export/DB-switch20-cycle UI profile not executed.
- T45-16 PASS：39281/10001-tail/100k/1000x64KiB; cold timing and foreground responsiveness recorded separately.
- T45-17 PASS：Actual UI feedback <=250ms; export/read stop <=2000ms; no published or partial file; production write rollback/commit barrier retained.
- T45-18 PASS：Writer cutoff, missing producer, sequence/count/hash consistency; real debug collector and actual legacy counts checked.
- T45-19 PASS：Current-build isolated main/renderer hang/crash/kill/restart; independent writer, safe recovery and clean close.
- T45-20 PASS：Current diagnostics queue/readonly/sharing denial/retention/suspend tests; unchanged .44 disk/partial/redaction coverage retained.
- T45-21 PASS：Five paired normal production writer ON vs test-only OFF; median <=10%; CPU/RSS separately retained.
- T45-22 PASS：Frozen importer unchanged; current55/130 exact rollback tests, packaged55 import; legacy44/113 and ranks source evidence reused because dependencies frozen.
- T45-23 PASS：Current orphan/SQL-failure checks plus unchanged production relink and frozen .44 source-link golden evidence.
- T45-24 PASS：Current source build/UI;1366/1920 and125% Chromium emulated scale. Windows system DPI manual gate still pending.
- T45-25 PASS：Temporary ASAR without AppEXE before packaging, licenses/native/private exclusion; actual output scanned separately.
- T45-26 PASS：All3 artifacts/ASAR verified; unpacked and Portable initial UI pass. Original wrapper failed only the initial relocation readiness deadline; immutable failure retained.
- T45-27 PASS：PASS after unchanged retry; original root absent and relocated database restored. Initial launcher-to-child27.793s exceeded20s harness deadline; late App did-finish-load/ready confirmed and closed gracefully. Not claimed to be a cold-start performance pass.
- T45-28 FAIL：RELEASE BLOCKER: installer command exited0 but uninstall removed entire APP_ROOT, including both isolated synthetic databases. Original harness does not assert user-data preservation; no original user data affected.
- T45-29 PASS：Scoped source review, original protected report hash, no private inputs staged, reports/time/token and firstEXE freeze tracked.
- T45-30 NOT_RUN：Requires user explicitly confirming v0.3.45 GUI 驗收 PASS for this exact candidate hash.

## 執行時間統計

起始 2026-09-08T17:15:10.8858685+08:00；截止 2026-09-08T10:55:54.418Z；經過 100.73 分；記錄命令區間聯集 36.34 分。工作/等待拆分 UNAVAILABLE。完整失败/重試與前五耗時見 Execution_Time_Ledger。初期探索與patch重試沒有完整逐命令帳，不以零補齊。

## Token 消耗統計

OpenAI；精確模型及 Input/Cached input/Output/Reasoning/Total 均 UNAVAILABLE。此介面未提供實際usage，不能估算或用帳戶額度換算。

## Windows 候選

{
  "appVersion": "0.3.45",
  "packagedSourceCommit": "d62a8a782c30befc14810541ac9ea91c24f3ad6b",
  "buildTime": "2026/09/08 18:33:20",
  "buildTimeIso": "2026-09-08T10:33:20.935Z",
  "buildMachine": "pc1-ch_kao",
  "buildOs": "Windows_NT 10.0.26100 x64",
  "gitBranch": "feat/v0.3.45-integrated-raw-cache-export",
  "dirtyState": true,
  "artifacts": [
    {
      "fileName": "Jira Activity Analyzer Portable 0.3.45.exe",
      "sizeBytes": 190964155,
      "sha256": "f0029a2a44710f93e5cadb438d88fe66f4fa78d41b460f7014ead3f4eef99d09"
    },
    {
      "fileName": "Jira Activity Analyzer Setup 0.3.45.exe",
      "sizeBytes": 191194238,
      "sha256": "1baa809a1c28573a36c3455cd4182bb0b16b9e5c92fe24557cef7cf8418488d3"
    }
  ]
}

- F:\AI\JiraActivityAnalyzer\release\v0.3.45-candidate\Jira Activity Analyzer Setup 0.3.45.exe
  191194238 bytes / 182.34 MiB / SHA256 1baa809a1c28573a36c3455cd4182bb0b16b9e5c92fe24557cef7cf8418488d3
- F:\AI\JiraActivityAnalyzer\release\v0.3.45-candidate\Jira Activity Analyzer Portable 0.3.45.exe
  190964155 bytes / 182.12 MiB / SHA256 f0029a2a44710f93e5cadb438d88fe66f4fa78d41b460f7014ead3f4eef99d09
- F:\AI\JiraActivityAnalyzer\release\v0.3.45-candidate\win-unpacked\Jira Activity Analyzer.exe
  235706368 bytes / 224.79 MiB / SHA256 f6718cdec824c88dd01ebedcb8eea9e2b54f5158894eef52bc6cbcedc5d35445

Source commit: d62a8a782c30befc14810541ac9ea91c24f3ad6b。Report生成時HEAD: d62a8a782c30befc14810541ac9ea91c24f3ad6b；含本報告的commit於提交後由Git查得。首EXE凍結紀錄見test-artifacts/v0.3.45/freeze.json；首EXE後仅更新事實報告。

## 規範與人工 Gate

交付規範 v1.1.0 SHA256：6c1d5793ff430104b51a81dcddfaa87c9792d438d9588d403aca6e5dff2afb9f。
Branch：feat/v0.3.45-integrated-raw-cache-export。未 Tag／Push／Release。原 v0.2.47 報告 SHA256 9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d；原未追蹤檔案未操作。
請核對指定候選hash後進行人工GUI；自動化截圖不能替代明確「v0.3.45 GUI 驗收 PASS」。本報告列出的額外覆蓋缺口也不得隱藏；若首EXE後需要新增或修改測試/程式/打包輸入，需先取得下一版授權。

## 最終封裝驗證補充

- 三種 EXE 與凍結 source SHA 均再次核對一致；未修改 source/tests/packaging。
- Portable 搬移首輪超過 harness20秒等待；約27.793秒後啟動子程序並成功 did-finish-load/ready。相同 EXE 與相同 harness 重試 PASS。首輪 FAIL 永久保留，不改寫成從未失敗。
- **Release Blocker：Installer 卸載刪除整個安裝 APP_ROOT，包括本次合成 Raw/AI DB。原 harness exit0未涵蓋資料保留，正式 T45-28 因此 FAIL。僅隔離合成資料受影響，使用者原資料未動。**
- 請勿將此 Installer 當正式交付使用；Portable可供隔離人工驗收，但整版尚不具 Release資格。
- 已有首EXE，依規範不修改 v0.3.45。需 v0.3.46 授權處理卸載資料保留、Portable harness時序/cleanup及六項組合覆蓋缺口；未自動升版、Tag或Push。
- 三個 App EXE 均 NotSigned；另有預設icon、dependency重複參照、chunk大小及node:crypto提示，詳Test Report。
