# Jira Activity Analyzer v0.3.38 Acceptance Report

## Conclusion

v0.3.38 AI Analysis Database、strict import contract、Golden Fixture regression、production build，以及 Windows Installer／Portable／win-unpacked 封裝均已完成。win-unpacked 與 Portable 的 packaged bridge diagnostics 均通過。

整體狀態為 **PARTIAL / MANUAL GUI VALIDATION PENDING**。既有跨版本 UI smoke 在 route audit 前因 `connections.testAndSave` bridge mismatch 失敗，後續產生連鎖誤報；另一次 Portable CDP 嘗試未透過 portable wrapper 取得 renderer endpoint。未隱藏失敗，也未為了讓測試通過而修改 production 行為。

## Acceptance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| Independent AI SQLite and frozen DDL | PASS | `test:v0.3.38`; schema version 1 |
| Strict package v1.0.0 preflight | PASS | Schema SHA, Ajv 2020-12, identity/count/hash validation |
| Golden AI-only import | PASS | 59 records / 86 findings |
| Reviewed replacement | PASS | 59 completed; 81 accept; 5 reject; 10 disagreements |
| Idempotency and rank protection | PASS | duplicate no-op; 59 protected skips |
| Atomic rollback | PASS | synthetic failure leaves no partial batch |
| Source Link attempts | PASS | append-only attempts and relink regression |
| AI-only and integrated queries | PASS | server paging/filter; raw LEFT JOIN retained |
| Archived old AI navigation | PASS | disabled sidebar item and redirect regression |
| Debug Bundle AI diagnostics | PASS | metadata/action/link/attempt/integrity; no SQLite copy by default |
| TypeScript / production build | PASS | exit 0 |
| Installer / Portable / win-unpacked | PASS | dist exit 0; hashes in build manifest |
| Packaged bridge loadability | PASS | win-unpacked and Portable receipts exit 0 |
| Full legacy UI smoke | FAIL (existing harness drift) | `connections.testAndSave is not a function` then cascading failures |
| Three-page manual GUI inspection | PENDING | Portable wrapper did not expose CDP endpoint; no desktop screenshot used |

## Safety

未執行真實 Jira、AI provider 或 production SQLite 整合。Git 不包含 Token、密碼、Cookie、`.env`、Database、Debug Bundle、Installer 或 Portable。使用者既有修改與未追蹤檔案均保留。
