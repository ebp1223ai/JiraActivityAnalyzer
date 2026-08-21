# v0.3.27 Error Normalizer

`normalizeJaaError` 統一處理 Error、string、structured IPC error、plain object、null、undefined 與 unknown primitive，輸出穩定 errorId/code/繁中訊息/technical message/stage/source/time/cause/safe details。

測試 7 種 error shape 全數具有 code 與 message，無法輸出 `undefined: undefined`。Redactor 遮罩 Authorization、token、delivery handle 與 artifact token；deduplicator 保留 occurrence count 及首次/最後時間。
