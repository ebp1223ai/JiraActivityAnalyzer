# JiraActivityAnalyzer v0.3.26 Layered Validation Report

固定順序共 14 個獨立 receipt：Token／Run binding、decodable submission、schema、count/index、quote IDs、source/role attribution、status semantic、quality、canonical、analyzed result、active result、package、HTML、SQLite。每層有 status、finding 與 owner stage；錯誤會 aggregate，後續不安全 stage 會明確 blocked/skipped。

聚焦測試產生並驗證 `validationStageReceipts=14`。正式失敗不得建立 Canonical／Active Result 或允許 SQLite。production SQLite 未執行。
