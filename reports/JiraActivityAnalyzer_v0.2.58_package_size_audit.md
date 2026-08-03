# Jira Activity Analyzer v0.2.58 Package Size Audit

## 產物

| 產物 | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| `release/Jira Activity Analyzer Setup 0.2.58.exe` | 105,370,785 | 100.489 | `10d8492e6dc7b0b169f0635b2475a824af58576eaa4168de87467b6d91871a16` |
| `release/Jira Activity Analyzer Portable 0.2.58.exe` | 105,140,723 | 100.270 | `965f13a96cdbdf27114a77f7a1b880d61ad1483db4957f7bd5f881aef21513d9` |
| `release/win-unpacked/resources/app.asar` | 15,922,669 | 15.185 | `ad48c09999a4d7260bbddb4e5735eb83edd1aa301187113ecc266b97797ebbe5` |

## 封裝內容

- `win-unpacked`: 390,223,678 bytes（372.146 MiB）
- `resources`: 16,030,189 bytes（15.288 MiB）
- packaged `node_modules`: 13,575,297 bytes（12.946 MiB）
- `app.asar.unpacked`: 不存在；沒有額外 native unpack scope
- ASAR entries: 2,076
- `unexpectedPackagedContent`: 0
- 已確認 Windows 路徑格式下包含 `dist/index.html`、`dist-electron/main.cjs`、`dist-electron/preload.cjs`、`package.json`
- 未發現 `.env`、DB/SQLite 或 backup 檔案進入 ASAR；`release/.env.Version` 僅為版本化範本

## Build Info

- Version: `0.2.58`
- Source commit: `36375920ee1a8913b24bbb4718fff7deb91933a5`
- Branch: `feat/v0.2.58-date-range-excel-filtering-content-diff-ux`
- Build time: `2026/08/03 19:10:08`（Asia/Taipei）
- Dirty state: `false`

electron-builder 回報部分 transitive dependency path 無法解析，另有既有 Vite 大 chunk 警告；兩者皆為非致命警告，封裝 exit code 為 0，ASAR 稽核與 packaged renderer 啟動檢查均通過。
