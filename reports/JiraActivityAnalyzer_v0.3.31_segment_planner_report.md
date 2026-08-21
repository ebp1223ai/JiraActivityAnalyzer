# v0.3.31 Segment Planner Report

Planner jaa-protected-token-safe-segment-planner-v1，limit 4,096，schema jaa-model-input-segment-v3，transport bridge-resumable-v4。真實四檔 297,974 bytes、75 variable segments，planner 209.234 ms。UTF-8、CRLF、JSON escape、protected span、coverage 與 reassembly 全部安全；無 0-byte、gap、overlap、token cut。全體 plan SHA-256: 2db66e0f2dfa3e584f2d5afea570e3e2fbb508611e63be4aae864816704cb0b3。超限 token 以 AI_PROTECTED_TOKEN_EXCEEDS_SEGMENT_LIMIT fail closed。
