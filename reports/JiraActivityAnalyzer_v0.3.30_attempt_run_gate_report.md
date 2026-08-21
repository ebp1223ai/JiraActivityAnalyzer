# v0.3.30 Attempt and Run Gate Report

Analysis startup now performs Bridge preflight after the user action creates an Attempt but before a Canonical Run is allocated. A failed preflight writes `bridge-preflight-receipt.json` and `provider-dispatch-ledger.jsonl` in the Attempt archive, marks the Attempt failed, denies Results navigation, and leaves the Active Result unchanged.

A Canonical Run is created only after Bridge readiness is proven. The successful receipt is copied into Run debug evidence and the Run dispatch ledger starts empty until request preparation.
