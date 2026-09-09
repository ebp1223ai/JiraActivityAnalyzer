# v0.3.47 Implementation Report

## 實作範圍

- R47-01/02：Integrated 五狀態中英複選、初次預設四項；頂端/欄頭同 state，[]、全選與缺省分開。清除所有篩選／恢復預設／取消全選語意分離，保留排序欄位。
- R47-03/04：`shared/integratedDisplayV047.ts` 統一選取 active AI SourceTrace；主 Diff/快篩/搜尋/排序/候選/匯出讀相同 metadata。compact 保留；AI 不可用不偷換 Raw。无有效 link 才 Raw。
- R47-05：policy revision/canonical selection 加入 query/cache；沿用 worker/export lifecycle；AI unavailable 不偽裝正常 Raw-only。
- R47-06：Raw 三欄、Comment 全文、Package/SourceTrace/review 保真。沒有 DDL/Frozen/Workbench/分析引擎修改。
- R47-07：nonce + synthetic marker + test mode 下 worker barrier，僅測試控制入口，無 IPC/preload/contextIsolation 放寬。
- R47-08：只完整 win-unpacked ZIP；首次 EXE 後 source/harness/packaging 凍結。
- R47-09：逐命令 WorkLedger 與可讀 WorkTimeline、前後額度/差異；精確 Token 無法取得，觀測缺口不補造。

## 追溯與邊界

Baseline `130c5adb597d1cd5f8f4ffed26df9d6d79614885`；branch `feat/v0.3.47-integrated-ai-status-diff`。輸入包 81 SHA256 PASS、validator 560 PASS；Frozen DDL SHA256 `1ad8269f4b70eb98571a551bf436cb9a022d681d8f69efef718548cd353cf648` 未修改。交付規範 v2.1.0 SHA256 `95790b94e24c89bf07b4ab390efce4d76c55549dcd5347a8848f751681efb271`。

所有用於測試的新增 DB 都是隔離 synthetic，沒有存取真實私有 DB/Token。保護的 v0.2.47 report hash `9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d` 不變。原16項 untracked 保留且排除提交。

## 執行時間統計

起始 2026-09-09 18:48:50 Asia/Taipei；逐項與最終截止見 [WorkTimeline](WorkTimeline.md)。COMMAND_ONLY 含工具往返，不等於完整模型 coding/read 時間。未知空檔、記帳尾段分開，階段差異與 baseline 淨差異不相加。

## Token 消耗統計

首筆主要週窗口剩餘22%；目前/最終值見工作帳。精確 Token UNAVAILABLE，共享帳戶其他活動 UNKNOWN。0pp 不代表0Token；一筆 reset timestamp 變化不能跨窗口扣減。

## 交付狀態

Source 與實際開發 ZIP 自動驗證已完成，人工 GUI PENDING。詳細交付見 [DevelopmentDeliveryReport](DevelopmentDeliveryReport.md)。正式發布 NOT_READY。K46-01 Installer 卸載資料保留 DEFERRED_ISSUE；沒有 Installer/Portable、Tag、Push、Release。
