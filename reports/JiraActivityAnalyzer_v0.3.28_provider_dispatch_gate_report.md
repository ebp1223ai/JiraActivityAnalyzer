# v0.3.28 Provider Dispatch Gate

The gate executes before `thread/start`, creates the production Manifest object, serializes and decodes it, validates files/records/segments/bytes/hashes/contracts, and writes `provider-dispatch-gate-receipt.json`. Failure is fail-closed and leaves Provider Thread/Turn uncreated. UI evidence shows expected and observed transport and states that ChatGPT was not contacted.
