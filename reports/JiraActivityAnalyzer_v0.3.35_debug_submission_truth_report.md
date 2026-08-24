# v0.3.35 Debug Submission Truth Report

Debug evidence now collects the unique Host Controller snapshot and append-only transition log. Submission completeness distinguishes persisted submission, publish-blocked submission, rejection before decode, and prior-failure absence. A durable raw Artifact is no longer classified as `not_applicable_no_submission`. Root error and derived consequence fields remain separate; recoverable progress warnings do not overwrite the root cause.

Credential policy remains unchanged: full token, handle, nonce, Authorization value, `.env`, database content, and debug bundles are excluded from source/package delivery.
