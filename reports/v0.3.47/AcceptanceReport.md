# v0.3.47 Acceptance Report

以下為首 EXE 前 Source Gate 快照，逐層證據不將 service 冒稱真 UI。封裝後補驗：T25 payload PASS、T26 ZIP/實際 EXE PASS、T27 APP_ROOT/關閉後 DB 可讀 PASS。T29 帳本勾稽見 TimeSummary，觀測缺口明列；T28/T30 人工與正式交付 Gate 仍待使用者。詳見 [DevelopmentDeliveryReport](DevelopmentDeliveryReport.md)。

| ID | 項目 | Source 狀態 | 證據／範圍 |
|---|---|---|---|
| T47-01 | 初次預設四種 | PASS | 真 renderer 初始偏好與缺省；有效配對決定狀態。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955339990/report.json) |
| T47-02 | 32 種集合 | PASS | 32 子集合逐一比對；[] 是 0，facet 自身排除。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) |
| T47-03 | 母體與診斷 | PASS | Raw LEFT JOIN、空/未選/未配/部分/完整/孤立/ambiguity/不同 DB；missing AI/SQL error 明確拋錯，IPC unavailable guard 審查。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.43/correctness-1788956747047/results.json) [證據](../../test-artifacts/v0.3.43/integration-1788956796396/results.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-04 | 計數與分頁 | PASS | Raw/filtered/page 分列；無 fanout。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) |
| T47-05 | 標籤與欄頭同步 | PASS | 中英狀態/定義、頂端與表頭共用 state；不混 Review Rank。 [證據](../../test-artifacts/v0.3.47/ui-1788955339990/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-06 | 偏好與明確空集合 | PASS | 合法舊值、非法診斷、[]；落盤後 renderer reload 保持 0。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.46/worker-1788956170110/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-07 | 清除/預設/取消 | PASS | 三種操作不同；真表頭排序與寬度保留。 [證據](../../test-artifacts/v0.3.47/ui-1788955339990/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) |
| T47-08 | 日期搭配多選真 UI | PASS | 同日/跨日/單邊/毫秒/非法/時區、AI+Actor OR/AND、A-B-A。只引用此 run 已完成子測項；整個 run 後來失敗不冒稱 PASS。 [證據](../../test-artifacts/v0.3.47/ui-1788955339990/report.json) |
| T47-09 | Raw != AI 主 Diff | PASS | 同 event ID 主格 AI 紅刪綠增，無須展開。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) |
| T47-10 | compact | PASS | AI 可信片段，Before 不可得不切 Raw。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-11 | 缺失與完整性 | PASS | 缺失/UNVERIFIABLE 主格不可用；不將 Raw 冒充 AI。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-12 | 無唯一配對 | PASS | active analysis 與唯一 link；ambiguity Raw、不同 DB 身分隔離。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.43/integration-1788956796396/results.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-13 | 三頁同事件真 UI | PASS | User Raw vs AI/Integrated AI，內容刻意不同；Comment Create/Update 全文。 [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-14 | 16 快篩真 UI | PASS | 独立合成 cases 預期；Comment 不受 Description 快篩。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) |
| T47-15 | display 搜尋/排序/欄位 | PASS | 實際 Diff 文字搜尋/排序/候選；typed null/0/false/empty；10001 尾端欄位。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) [證據](../../test-artifacts/v0.3.43/correctness-1788956747047/results.json) [證據](../../test-artifacts/v0.3.43/integration-1788956796396/results.json) |
| T47-16 | 四種完整匯出 | PASS | CSV/JSON 顯示/全部；55 > 25 頁；原始 trace/review hash 不變。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-17 | 匯出競態 | PASS | picker 狀態快照、Raw 切換、取消、39281 writing cancel，只清自己 partial。 [證據](../../test-artifacts/v0.3.46/worker-1788956170110/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-18 | 五次 A-B-A | PASS | 相同查詢無新 job，頁碼/偏好維持。 [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-19 | query inflight 真 UI | PASS | 實際 worker barrier entered 證實尚未完成；route/date/status/Raw/AI 切換。 [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-20 | revision/資源/取消 | PASS | commit/noop/rollback，CANCELLED vs SUPERSEDED，20 route/status cycles 有界。 [證據](../../test-artifacts/v0.3.46/worker-1788956170110/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-21 | Raw 三欄與 Comment | PASS | Raw Issue Type/Current Status/Priority；Comment 全文/N/A。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.46/worker-1788956170110/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-22 | Golden/不变性 | PASS | 2.0.0 三 rank 44/113；2.0.1 55/130、rank 保護/回滾/idempotency；原值保留。 [證據](../../test-artifacts/v0.3.46/worker-1788956170110/report.json) [證據](../../test-artifacts/v0.3.43/integration-1788956796396/results.json) [證據](../../test-artifacts/v0.3.43/correctness-1788956747047/results.json) [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) |
| T47-23 | 效能觀測 | PASS | 同 39281/55 母體 before/after，冷/暖/actor/facet；runtime pipeline/IPC/render/export traces。秒數不是硬 Gate。 [證據](../../test-artifacts/v0.3.47/paired-profile-1788955176817/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) |
| T47-24 | 首 EXE 前審查 | PASS | 本 SourceCoverage + typecheck/build + 記帳工具風險測試 + sensitive/prepack。 [證據](../../test-artifacts/v0.3.47/service-1788955150051/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955618819/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788955339990/report.json) [證據](../../test-artifacts/v0.3.47/ui-1788956194077/report.json) [證據](../../test-artifacts/v0.3.43/correctness-1788956747047/results.json) [證據](../../test-artifacts/v0.3.43/integration-1788956796396/results.json) |
| T47-25 | 單 target 預檢 | PASS | SOURCE_CONFIG PASS：package:v0.3.47 只 dir；payload/Bridge/EXE 部分待封裝後補證。  |
| T47-26 | ZIP 與 EXE | PENDING | 待首 EXE。  |
| T47-27 | 路徑與關閉資料 | PENDING | 待 ZIP 隔離 EXE。  |
| T47-28 | 人工 GUI | MANUAL_GUI_PENDING | MANUAL_GUI_PENDING，必須由使用者指定 hash 明確 PASS。  |
| T47-29 | WorkTimeline | PASS | SOURCE_TOOL PASS：分類/淨差/缺值/reset/overlap/duplicate/orphan；完整記錄有已知觀測缺口，交付時另結算。  |
| T47-30 | 版本與交付 | PENDING | 待 source commit / hash / final reports；不得 Tag/Push。  |

G47-INSTALLER / G47-PORTABLE = N/A_MODE。未核准人工 GUI 不建立 tag 或 push。
