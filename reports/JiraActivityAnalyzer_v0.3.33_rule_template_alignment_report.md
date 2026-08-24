# v0.3.33 Rule and Template Alignment Report

| Role | File | Bytes | SHA-256 |
|---|---|---:|---|
| Manifest | `Skill_Analysis_Rule_Set_Manifest_v0.8.2.md` | 26502 | `13334c6cdd598d0499841438cdc595de7facee908aca83e9ed16b4c1cd26558c` |
| Common Rules | `Skill_Classification_Common_Rules_v1.6.2.md` | 41369 | `54fc40aac4e9bc07d1a34480c8f50dde4ab919c605b2d00148268192752e17b5` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | 24636 | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| HTML Template | `Skill_Analysis_HTML_Report_Template_v1.5.1.md` | 38057 | `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02` |

All four files were copied byte-for-byte without BOM or line-ending normalization. Manifest machine JSON and Template machine JSON parse successfully. Manifest filename/version/bytes/hash bindings match the actual Common Rules, Catalog, and HTML Template. Template and renderer require `LAYERED_VALIDATION_RECEIPTS_V2`; stale V1 compatibility fails closed before Provider dispatch.

Packaged verification found these exact hashes in app.asar and found no forbidden `.env`, credential, database, debug archive, or user source-data path.
