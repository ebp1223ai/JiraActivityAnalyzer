# Jira Activity Analyzer v0.2.51 Package Size Audit

- Packaged source commit: `0dcaf28af1bf51eab0c334c3ebf9620ede6cde63`
- Build Time: `2026/07/30 18:45:10` (Asia/Taipei)
- Electron: `43.0.0`; electron-builder: `26.15.3`
- ASAR entries scanned: `4681`; forbidden entries: `0`
- Unexpected dependency docs/tests/examples in ASAR: `0`
- `app.asar.unpacked`: `False` / 0 bytes

| Artifact | Exact path | Bytes | MiB | SHA-256 |
|---|---|---:|---:|---|
| Installer | `release/Jira Activity Analyzer Setup 0.2.51.exe` | 106263090 | 101.34 | `01447249438E9366E3755299344117E43AFE03DA47134113F83CFA5B56FABA96` |
| Portable | `release/Jira Activity Analyzer Portable 0.2.51.exe` | 106033005 | 101.121 | `F34817333E5E66935E2961E2C60FC347EC73DDDD7BB650907F10417D09BAC42F` |
| app.asar | `release/win-unpacked/resources/app.asar` | 24100596 | 22.984 | `CEB3C90BD308386D702A2696621BA4225ABCF25B94A1257FEAB545699B21678C` |
| Unpacked EXE | `release/win-unpacked/Jira Activity Analyzer.exe` | 235706368 | 224.787 | `3A95FD047BC60650DA5EC143087E214A81FF85C81D352F3268C87B3F15AAD4DD` |
| win-unpacked | `release/win-unpacked` | 398401605 | 379.945 | Directory; per-file container hashes above |

## Capacity

- Resources: 24208116 bytes / 23.087 MiB.
- Packaged node_modules: 21255449 bytes / 20.271 MiB, all inside ASAR.
- Electron/Chromium runtime remains the dominant capacity source.
- Release binaries and `test-artifacts/package-size-v0.2.51.json` are ignored and are not committed.