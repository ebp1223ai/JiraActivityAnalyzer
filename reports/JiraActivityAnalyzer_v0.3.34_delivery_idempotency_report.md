# Delivery Idempotency Report

Target Version: 0.3.34
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 705e28201b02d63b563b1dbc8840cdc5c1402916
Branch: feat/v0.3.34-provider-lifecycle-live-analysis-validation
Generated: 2026-08-24T09:18:53.5590429Z

- First finalize: creates one durable receipt and enters INPUT_READY.
- Identical finalize replay: returns the original lifecycleReceiptId with idempotentReplay=true.
- Mismatched replay: fails closed with AI_MODEL_DELIVERY_FINALIZE_MISMATCH.
- Post-finalize status: readonly and permitted.
- Post-finalize segment mutation: rejected as AI_MODEL_DELIVERY_HANDLE_REPLAYED.
- Offline unit coverage: PASS.
