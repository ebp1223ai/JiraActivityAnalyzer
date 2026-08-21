# v0.3.29 Terminal Lifecycle Consistency Report

Recoverable cursor mismatch is retained as a recovered warning after a successful status/read/finalize continuation; an unrecovered mismatch becomes root error on termination. HTML status is owned by the current bridge snapshot instead of calling a missing legacy callback.

Source regression passed. A real post-fix Managed OAuth terminal lifecycle was not produced, so three-artifact terminal hash equality remains manual-validation pending.
