# JiraActivityAnalyzer v0.3.42 Execution Time Ledger

First observable timestamp: `2026-09-02T18:27:35+08:00`.

Measured command durations are recorded in `JiraActivityAnalyzer_v0.3.42_execution_time_ledger.json`. Major durations were app-only capture 225.557 s, successful dist 168.038 s, first UI smoke 73.682 s, Portable create/import 45.684 s, final UI smoke 45.520 s, relocated reopen 39.070 s, and win-unpacked smoke 30.809 s.

The initial dist attempt spent 19.259 s and exited 1 before producing any v0.3.42 artifact because the required user-owned v0.2.47 tracked change remained dirty. The authorized dirty-worktree retry succeeded without modifying or staging that file.

Absolute start time for the earliest 6.4-second ZIP safety command was unavailable from the provider; it is explicitly marked unavailable rather than reconstructed. Manual GUI time is not yet recorded because the Release Gate remains pending.

Report close timestamp: `2026-09-02T11:19:57.9030159+00:00`. Wall clock from first observable timestamp: **3142.903 seconds**. This includes implementation and tool latency, not only command execution.
