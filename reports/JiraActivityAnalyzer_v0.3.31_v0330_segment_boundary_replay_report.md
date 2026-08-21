# v0.3.30 Segment Boundary Replay Report

Supplied archive 唯讀解析。舊 transport bridge-resumable-v3；Pending 218,769 bytes、54 segments。舊 segment 38 tail 是 eq_1597081fd3c35b78，下一段 head 是 79094f429849d371，完整 ID 為 eq_1597081fd3c35b7879094f429849d371；模型提交值正是截斷前綴，EVIDENCE_QUOTE_ID_NOT_FOUND 根本 finding 恰為 1。

v4 對同一 Pending 仍為 54 segments，完整 ID 位於 segment 39 bytes 159,713..163,807，protectedTokenCutCount=0。Source 與 reassembly SHA-256 同為 c25fbd196716261854d2c6c514a038f82a2bba35aec0255989fd7f594913580e；plan SHA-256 為 c7ce26dd533c0e25ff9bd8204197a056d84cf1241b178f46a280442ede059ae9。Validator 沒有 prefix completion、fuzzy repair 或第二 Turn。
