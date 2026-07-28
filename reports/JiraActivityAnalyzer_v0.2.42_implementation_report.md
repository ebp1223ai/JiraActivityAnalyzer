# Jira Activity Analyzer v0.2.42 實作報告

## 版本主題

Stable Hash V4 與 Build Traceability Repair。

## 根因

v0.2.41 的 volatile metric 名稱清單未涵蓋 `Actual Duration`、`Review Time` 等實際 Jira 欄位，造成數值更新進入 Stable Hash，誤判為 `Updated` 並遞增 `content_revision`。此外，Full Fetch Result Index、Issue Manifest 與舊 Source Archive manifest 仍硬編碼 `0.2.40`／`0.2.41`，無法可靠追溯 packaged source commit。

## Stable Hash V4

- 新增獨立 `stableIssueContentV4.ts`，保留 V3 歷史實作。
- volatile field registry 僅使用 Jira metadata 的精確名稱解析與精確 Field ID 排除。
- 禁止用 `Time`、`Duration`、number schema 或 regex 廣泛排除欄位。
- 已確認 `customfield_12201 = Actual Duration`。
- 已確認 `customfield_12401 = Review Time`。
- 其他 configured names 只有在 metadata 唯一精確匹配時才加入 registry。
- registry evidence 包含 Field ID、display/normalized name、classification、exclusion reason、resolver source、schema summary 與 metadata fingerprint。
- fingerprint 使用 registry 的語意識別；display name 的大小寫或空白修飾不會造成不必要漂移。
- `lastViewed` 仍為固定 transport exclusion。

## Metrics 與 Candidate Diagnostics

- metric-only refetch 維持 `Existing`。
- `current_observed_metrics` 更新最新值、觀測時間與 run ID。
- Stable Hash、`content_revision`、Current Snapshot、Current Payload 與 Activity Events 不因 metric-only change 改變。
- number schema 下的 `"526.56"` 與 `526.56` 正規化為相同 metric value。
- 新增安全診斷：
  - `volatile-field-candidates.json`
  - `stable-hash-field-diff.json`
- candidate diagnostics 只輸出型別、長度、SHA-256 與短 scalar preview，不會自行修改 frozen policy。

## DB 與 Event 相容性

- Current-State schema 維持 version 2。
- Event Identity 維持 V2。
- Stable Hash V3 與更早 policy DB 在 v0.2.42 為 read-only。
- 本版不執行 migration、不回寫舊 revision、不清理舊資料。

## Build Traceability

- `VERSION`、`package.json`、`package-lock.json`、README 與 CHANGELOG 統一為 `0.2.42`。
- build 前新增 version consistency check。
- renderer 與 Electron main 共用 injected app version、build time 與 packaged source commit。
- Full Fetch Result Index、Issue Manifest、Source Object Index 與 Source Archive manifest 改用同一 build identity。
- packaging 僅允許 tracked worktree clean，並在 Electron Builder 前從目前 HEAD 重新 build。
- `release/build-info.json` 與 ASAR metadata 可供短版 metadata verification。

## Commit

- 功能實作 commit：`7b2432bb29820fa665d09833870463667bcaf548`
- Windows package runner 修正 commit：`4a90f72547759bde95a41a99c13c0b83f926d06d`
- 本次採用的 implementation commit：`4a90f72547759bde95a41a99c13c0b83f926d06d`
- packaged source commit：`4a90f72547759bde95a41a99c13c0b83f926d06d`

## 範圍外項目

未執行 44-Issue 真實 Jira smoke、長時間 packaged smoke、DB migration、incremental sync、DB merge、PostgreSQL、正式 Jira 寫入或 GitHub Release。
