# v0.3.22 Rule／Template Alignment 報告

Automated Status：`PASS`

| Formal asset | Version | SHA-256 |
|---|---|---|
| Skill Catalog | 0.3.1 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| Common Rules | 1.3.0 | `154d6af73922434a0f5d73b4630c4fc8f9d50b88a25c9bcae43151e8835b0e9b` |
| Rule Set Manifest | 0.4.0 | `e6f20f18166525ceaa62b65ca7e0c8c734e4f82f904026920098216af62936bd` |
| HTML Template | 1.2.0 | `406afea52b6c0cb12680708c9da4cae9f41b024caf9ab12a7e6a9f2f8665b8a4` |

- 四份 bundled asset 與使用者提供 authority bytes 相同，manifest identity/hash fail-closed。
- Template 綁定 Decision v3、Normalizer 1.0.0、Issue Snapshot v1 與 Renderer 1.2.0。
- Bundled rules 只含版本化正式檔名，不含無版本正式 alias。
- Run Workspace 以 manifest role 定位並保存 `Skill_Analysis_HTML_Report_Template_v1.2.0.md` 原始檔名。
- ASAR stale scan：v0.3.21 bridge 0、v0.3.22 bridge 1；bundled rules 位於 `resources/bundled-rules/v0.3.22` 且四份 hash 全部一致。
