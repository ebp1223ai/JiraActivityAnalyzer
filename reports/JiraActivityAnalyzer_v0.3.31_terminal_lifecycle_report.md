# v0.3.31 Terminal Lifecycle Report

Supplied v0.3.30 原有 2 個 failed terminal、artifact=submitting、validation=not_started。v0.3.31 replay 收斂為 1 個 failed；artifactStatus=rejected、artifactAttemptStatus=received、validationStatus=failed、firstFailedValidationStage=EVIDENCE_QUOTE_REFERENCE。Canonical/analyzed not_created、active unchanged、formal package/HTML not_created/not_started、diagnostic package/HTML created/created、SQLite blocked。terminalSnapshotHash=08e227e095e24e957167d94bea74b3f17ec036c2f08cd7c0562b6336062f1334。重複 finalize 不增加 sequence，finally 不覆寫 terminal snapshot。
