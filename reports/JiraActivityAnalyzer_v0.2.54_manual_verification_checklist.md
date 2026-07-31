# Jira Activity Analyzer v0.2.54 Manual Verification Checklist

Version: `v0.2.54`
Candidate: Development Manual Verification Candidate
Status: **PENDING USER**

Do not enter credentials in screenshots or reports. Use a read-only Jira account and a copy of any real SQLite database.

## A. Development Mode 啟動

- [ ] `npm run dev` 成功啟動 Electron
- [ ] 沒有白畫面
- [ ] UI 顯示 `0.2.54`
- [ ] `.env` 載入結果正確
- [ ] Jira Connection Test 正確
- [ ] Local Database Connection Test 正確
- [ ] DevTools 沒有未處理例外

## B. Full Fetch

- [ ] 單一 Issue Full Fetch 成功
- [ ] Issue Snapshot 正確
- [ ] Changelog 完整
- [ ] Comments 完整
- [ ] Worklogs 完整
- [ ] required sources 完整性狀態正確
- [ ] Complete／Partial 判定正確

建議測試 Issue：`COPGEN1-113552`。若已不適用，請以適合的測試 Issue 取代。

## C. Content／Diff Viewer

- [ ] Comment 最新本文顯示正確
- [ ] Worklog 最新本文顯示正確
- [ ] Description changelog 顯示正確
- [ ] 沒有 Before 時不把整篇誤顯示成綠色新增
- [ ] 有 From／To 時顯示真正差異
- [ ] Inline Diff 正確
- [ ] Side-by-side Diff 正確
- [ ] 無法精確配對時不猜測內容來源

## D. SQLite Migration

只可使用正式資料庫的副本進行人工測試。

- [ ] Schema v2 被正確辨識
- [ ] v2→v3 migration 成功
- [ ] `worklogs` table 正確建立
- [ ] Event Identity Policy 更新為 v3
- [ ] 舊 Issues／Comments／Events 沒有遺失
- [ ] Migration 失敗時可以 rollback

## E. 保存規則

- [ ] Complete Full Fetch 可以保存
- [ ] Worklogs 可以寫入
- [ ] Activity Events 可以寫入
- [ ] 原始壓縮 JSON 依現行政策保存
- [ ] Partial／Failed／Permission Restricted 禁止進入正式 SQLite
- [ ] UI 顯示不能保存的明確原因

## F. 去重

- [ ] 同一結果保存兩次不會產生重複 Worklog
- [ ] 不會產生重複 Comment
- [ ] 不會產生重複 Activity Event
- [ ] Current State 正確更新
- [ ] 第二次保存有 insert／update／unchanged 統計

## G. 本版不驗證項目

- [ ] Installer installation — NOT RUN
- [ ] Installer uninstallation — NOT RUN
- [ ] Portable launch — NOT RUN
- [ ] Portable APP_ROOT containment — NOT RUN
- [ ] Packaged `.env` resolution — NOT RUN
- [ ] Packaged `node:sqlite` compatibility — NOT RUN
- [ ] Artifact SHA-256 — NOT APPLICABLE
- [ ] Authenticode — NOT APPLICABLE
