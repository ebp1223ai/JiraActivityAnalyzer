# v0.3.30 Provider Dispatch Truth Report

The append-only `jaa-provider-dispatch-ledger-v1` separates `prepared`, `dispatch_attempted`, `provider_contacted`, `thread_created`, `turn_start_attempted`, `turn_accepted`, `turn_completed`, and `failed`.

Request preparation now writes `APP_ONLY/prepared` with no Thread or Turn. A `CHATGPT_VISIBLE/sent` message is appended only after `turn/start` returns a real Turn ID; its content SHA-256 remains the actual instruction SHA-256. Duplicate ledger events are idempotent, zero counters retain null timestamps, and failures preserve the last successful state.

The supplied v0.3.29 replay found a `sent` message with null Thread/Turn while all Provider counters were zero. v0.3.30 projects that evidence as `prepared_but_not_sent`.
