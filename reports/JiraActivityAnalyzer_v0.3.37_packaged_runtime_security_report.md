# v0.3.37 Packaged Runtime Security Report

- Installer, Portable and win-unpacked built from Source Commit `0e60c25d35610e52c6ec371854f3d2f792376176`; `dirtyState=true` is explicit.
- Bridge `0.3.37-bridge-v17`: 181460 bytes, SHA-256 `403b9093c2f95bc5ba49679eff851680c13baf80e31b24db1a35a8d593dc0770`; external count 1, ASAR count 0, stale count 0, loadability PASS for Portable and win-unpacked.
- Bundled Codex 0.147.0 SHA-256 `935a1911ed2556e4ffcec995f4886ac2ac425863ba26fed264df62e30272ad9d`; no PATH fallback added.
- ASAR: 4685 entries; forbidden filename scan found no `.env`, token, DB, archive, user test data, Mock adapter or v0.3.37 test exports.
- Portable and win-unpacked app-only DOM startup PASS: version and Build Time visible, 3 AI Analysis tabs, nonblank renderer, no renderer crash marker; desktopCaptured=false.
- Installer GUI remains Manual Validation Pending.