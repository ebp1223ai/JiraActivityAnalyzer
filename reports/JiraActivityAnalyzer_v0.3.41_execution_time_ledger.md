# JiraActivityAnalyzer v0.3.41 Execution Time Ledger

## Window

- Start: 2026-09-02 12:57:51 +08:00
- Evidence/report cutoff: 2026-09-02 13:50:22 +08:00
- Wall clock to cutoff: 00:52:31

## Entries

| Phase | Start / end | Duration | Command or activity | Result |
| --- | --- | ---: | --- | --- |
| Input verification | Immediately before ledger start; exact endpoints unavailable | Not independently captured | ZIP safety scan, extract, `SHA256SUMS.txt` verification | PASS 34/34 |
| Contract reading/design audit | Within execution window | Not independently captured | Manifest, formal prompt, design, reuse map, DB/schema/UI/acceptance inputs | COMPLETE |
| Implementation and focused iteration | Within execution window | Not independently captured | Database v2, migration, IPC, queries, UI reuse, fixtures/tests | COMPLETE |
| Final typecheck | Tool measured | 12.691 s | `npm.cmd run typecheck` | PASS, exit 0 |
| Full v0.3.41 regression | Tool measured | 10.186 s | `npm.cmd run test:v0.3.41` | PASS, exit 0 |
| Production build | Tool measured aggregate | 58.824 s | `npm.cmd run build` | PASS, exit 0 |
| Current-contract UI matrix | Tool measured aggregate | 76.150 s | `npm.cmd run test:ui` | PASS, exit 0 |
| Windows distribution | Build time 13:38:17; verifier 13:40:59 | About 174.7 s tool wall | `JAA_ALLOW_DIRTY_PACKAGE=1 npm.cmd run dist` | PASS, exit 0 |
| win-unpacked UI smoke | Tool measured | 58.586 s | packaged app-only smoke | PASS, exit 0 |
| Portable smoke, shared release root | Tool aggregate not retained | Not independently captured | packaged app-only smoke | FAIL, exit 1; v0.3.40 runtime-root interference retained |
| Portable smoke, isolated root | Tool measured aggregate | 68.806 s | byte-identical Portable app-only smoke | PASS, exit 0 |
| Legacy v0.3.28 packaged harness | Tool measured | 0.842 s | `npm.cmd run test:packaged-runtime-manifest-contract` | FAIL, exit 1; hard-coded retired bridge path |
| Package-size audit | Tool measured | 14.207 s | `npm.cmd run audit:package-size` | PASS, exit 0, one 5,544-byte finding |
| Packaged frozen-byte check | Tool measured | 4.9 s | SHA-256 source/package comparison | PASS 9/9 |

Durations not directly retained by the runtime are explicitly marked unavailable; no timing was invented. Some tool wall durations include process startup and polling overhead.
