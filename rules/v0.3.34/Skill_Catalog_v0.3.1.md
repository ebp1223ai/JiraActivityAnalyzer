# Skill Catalog v0.3.1

- File: `Skill_Catalog_v0.3.1.md`
- Catalog Version: `0.3.1`
- Previous Version: `0.3.0`
- Status: `review-draft`
- Baseline: `skills_classification_transfer_pack_v0.2`
- Prepared Date: `2026-08-14`
- Skill Count: `279`
- Populated Groups: `14`
- Unpopulated Groups: `4`（RMA、HostSD、HostSATA、NXS）

## 1. 文件定位

本文件定義技能分類時可使用的 Group、Skill ID、Skill Name 與既有分類線索。它是 AI／地端 AI／離線規則引擎的共同技能字典，不是公司正式職能評核結果，也不能單獨作為人員績效結論。

本版保留既有 Skill ID、Skill Name 與數量，不新增、刪除或重新編號技能；只補強已由比較測試證實會影響分類品質的候選邊界與負面條件。

### 1.1 v0.3.1 核心變更

1. 補強 `GC_006`、`GC_007`、`GC_009`、`GC_011` 的同 Group 多技能判斷界線。
2. 補強 `DEBUG_001` 與 `DEBUG_004` 的深度界線。
3. 補強 `SYSTEM_029` 必須有實際 Drive log 解析或判讀，不能只靠名稱命中。
4. 明定同一 Evidence 可同時對應多個同 Group 或跨 Group 技能，但每個 Skill 都必須有獨立技術面向與證據。
5. 本次補強不把任何單一測試結果直接升格為人工核准的正式技能定義；Catalog 狀態仍為 `review-draft`。

## 2. 使用原則

1. 一筆 Evidence 可對應多個技能，包括同一 Group 內的多個 Skill；每個 Skill 都要有自己的技術面向、正向證據、負面檢查、判定理由與來源。
2. 使用者所屬 Group 只能當弱提示，不可作為唯一依據。
3. Activity Event 主要用於定位待分析 Diff；只有操作 metadata 時不可高信心分類。
4. 自動化／Robot 事件只能作背景，不可直接算成人員技能。
5. 單一縮寫、Title Tag、Status、附件檔名或 substring match 不可產生 High confidence。
6. 每個結果必須能追溯到原始 Diff／Comment／History／Activity Event。
7. 缺少正式技能細節時，分析器必須輸出 `catalog_detail_missing`，不得自行虛構正式定義。

## 3. 正式 Skill Record Schema

每個 Skill 最終應具備：

| 欄位 | 必要 | 本草案狀態 |
|---|---:|---|
| `catalog_version` | 是 | 已有 |
| `group` | 是 | 已有 |
| `skill_id` | 是 | 已有 |
| `skill_name` | 是 | 已有 |
| `detail_description` | 是 | 多數待補 |
| `aliases` | 是 | 目前多為 Group 層級線索，待拆至 Skill |
| `strong_signals` | 是 | 目前多為 Group 層級 |
| `medium_signals` | 是 | 部分 Group 已有 |
| `weak_signals` | 是 | 待補 |
| `negative_rules` | 是 | 部分 Group 已有 |
| `evidence_fields` | 是 | 待逐 Skill 補齊 |
| `disambiguation` | 是 | 部分跨 Group 規則已有 |
| `confidence_notes` | 是 | 待補 |
| `change_history` | 是 | 待建立 |

> 本文件目前可用於 Group／候選 Skill 辨識與規則設計，但尚未完成 279 項逐 Skill 的正式 `detail_description`。在補齊並人工核准前，狀態維持 `review-draft`。

## 4. 技能數量摘要

| Group | Skill Count | Catalog 狀態 |
|---|---:|---|
| GC | 19 | 已有簡表與線索 |
| System | 43 | 已有簡表與線索；已合併 LPM |
| Security | 8 | 已有簡表與線索 |
| Flash | 18 | 已有簡表與線索 |
| FTLErrorHandle | 15 | 已有簡表與線索 |
| FlashErrorHandle | 28 | 已有簡表與線索 |
| Table | 11 | 已有簡表與線索 |
| RW | 43 | 已有簡表與線索 |
| RAID | 6 | 已有簡表與線索 |
| Debug | 9 | 已有簡表與線索 |
| MP | 23 | 已有簡表與線索 |
| HostPCIE | 25 | 已有簡表與線索 |
| HostUSB | 27 | 已有簡表與線索；已合併 USB |
| Tool | 4 | 已有簡表與線索 |
| RMA | 0 | 待提供正式技能表 |
| HostSD | 0 | 待提供正式技能表 |
| HostSATA | 0 | 待提供正式技能表 |
| NXS | 0 | 待提供正式技能表 |
| **合計** | **279** | 14 個 Group 已有 279 項 Skill |

## 5. Group 狀態

| Group | 狀態 | 備註 |
|---|---|---|
| GC | 已有技能表 | 主要與 Garbage Collection、GCSA、GC flow、GC buffer、WAF/WL 相關 |
| System | 已有技能表 | 已合併 LPM |
| Security | 已有技能表 | TCG、DICE、SPDM、ATA Security 等 |
| Flash | 已有技能表 | NAND、FIP、Cop0、Flash/Fphy、Vendor NAND flow 等 |
| FTLErrorHandle | 已有技能表 | FTL 層 Read/Program/Erase/VT/System Area EH |
| FlashErrorHandle | 已有技能表 | Flash/NAND 層 ReadVerify、MediaScan、Retry、MAG、ERS 等 |
| Table | 已有技能表 | TableUpdate、Trim、InitInfo/VT、SPOR、Table Event |
| RW | 已有技能表 | Read/Write flow、RCQ/WCQ、PreRead、COP0、PKE、Data Path |
| RAID | 已有技能表 | RAID encode/decode/protection/PKE |
| Debug | 已有技能表 | Bug analysis、branch maintenance、debug SOP |
| MP | 已有技能表 | Burner、QMP、Card init、VUC、BootLoader、RUT/DBT |
| HostPCIE | 已有技能表 | NVMe/PCIe command、feature、format/sanitize、HMB、trace |
| HostUSB | 已有技能表 | 已合併 USB Group；USB/PD/USB4/USB3/SCSI/APU |
| Tool | 已有技能表 | SSD_Utility、RabbitX、Smart RMA Robot、CI/CD |
| RMA | 未提供技能表 | 暫不自動分類，除非明確出現 RMA |
| HostSD | 未提供技能表 | 暫不自動分類 |
| HostSATA | 未提供技能表 | 暫不自動分類 |
| NXS | 未提供技能表 | 暫不自動分類，除非明確出現 NXS 驗證 |

已移除獨立 Group：

- USB：併入 HostUSB。
- LPM：併入 System。

---


## 6. 技能清單與既有分類線索

### GC Group

| Skill ID | Skill Name |
|---|---|
| GC_001 | D1 D3 架構 |
| GC_002 | FreePool |
| GC_003 | PTEBMP |
| GC_004 | Over Provisioning |
| GC_005 | GC Buffer |
| GC_006 | GC Kernel |
| GC_007 | GC Suspend/Stop Flow |
| GC_008 | GC Sustain |
| GC_009 | GC Event 排程 |
| GC_010 | Maya |
| GC_011 | Pausing GC |
| GC_012 | Cache Policy |
| GC_013 | EDR |
| GC_014 | Low Valid Count Policy |
| GC_015 | GC Reserved Max Space Unit |
| GC_016 | FNV |
| GC_017 | High Rand Read Count Policy / Early BG GC |
| GC_018 | WAF |
| GC_019 | WL |

強分類線索：GCSA、Build GCSA、GC Kernel、GC Flow、GC.CopyData、Copy Data、GC Buffer、Pausing GC、GC Sustain、GC Program、Backup GCSA、GCSA Table、GC Table Part、FTLGCInitGCSATable、FTLGCBuildGCSA、FTLGCCopyReadInit。

中分類線索：Valid Count、WAF、WL、Low Valid Count、FreePool、Over Provisioning、GC Event、Sustain performance、Minor Layer、D1/D3。

排除條件：只有 `GC` 出現在 title，但 description/comments 沒有 GC flow 內容時，最多中低信心。只有 `WAF` 不足以分類 GC，需要看是否在 GC/performance context。

候選界線：

- `GC_006`：核心 GC/GCSA 建置、CopyData、搬移或 GC kernel/flow 實作。只有一般「GC」字樣不足。
- `GC_007`：Suspend／Stop／Resume 的條件、狀態轉移、停止點或相關錯誤處理。
- `GC_009`：Event 建立、觸發、queue、dispatch、wake-up、排程條件或事件時序。不能因同筆已有 `GC_006` 就刪除有獨立排程證據的 `GC_009`。
- `GC_011`：明確的 pause／unpause／pausing 狀態與控制機制。一般 suspend/stop 只支持 `GC_007`；只有獨立 pausing 證據才另列 `GC_011`。
- 同筆 Evidence 同時具有 kernel/flow 與 event scheduling，或 suspend/stop 與 pausing 兩種獨立技術面向時，可保留多個 GC Skill；不得為了只選一個「主要技能」而丟棄次要但有證據的技能。

---

### System Group

| Skill ID | Skill Name |
|---|---|
| SYSTEM_001 | Boot Code |
| SYSTEM_002 | Efuse |
| SYSTEM_003 | HMB |
| SYSTEM_004 | D2H |
| SYSTEM_005 | I2C |
| SYSTEM_006 | I3C |
| SYSTEM_007 | SMBus |
| SYSTEM_008 | MCTP |
| SYSTEM_009 | SPI |
| SYSTEM_010 | UART |
| SYSTEM_011 | Thermal Throttling |
| SYSTEM_012 | Clock |
| SYSTEM_013 | RTT |
| SYSTEM_014 | CPU ARM R52 Stack |
| SYSTEM_015 | CPU Andes N25/N45 |
| SYSTEM_016 | Multi-Core CPU |
| SYSTEM_017 | Doorbell |
| SYSTEM_018 | MR |
| SYSTEM_019 | BMU |
| SYSTEM_020 | DMAC/Copy Engine |
| SYSTEM_021 | SOC AXI/AHB |
| SYSTEM_022 | System PD0/PD1 |
| SYSTEM_023 | GPIO/Sideband |
| SYSTEM_024 | VDT |
| SYSTEM_025 | LED |
| SYSTEM_026 | FPHY |
| SYSTEM_027 | ITC |
| SYSTEM_028 | RNG |
| SYSTEM_029 | Drive log |
| SYSTEM_030 | AOM |
| SYSTEM_031 | Shadow DBUF |
| SYSTEM_032 | RAM Arrangement |
| SYSTEM_033 | Boot Loader |
| SYSTEM_034 | 工規相關應用 |
| SYSTEM_035 | Config |
| SYSTEM_036 | PMIC |
| SYSTEM_037 | Set PS Flow |
| SYSTEM_038 | APST |
| SYSTEM_039 | LPM Mode |
| SYSTEM_040 | Active Idle |
| SYSTEM_041 | PCIe 相關 |
| SYSTEM_042 | Measure Power and Latency |
| SYSTEM_043 | MS, MM25, Athena, PHM |

強分類線索：HMB、DBUF、Shadow DBUF、DMAC、Copy Engine、BMU、Doorbell、CPU Stack、ARM R52、Andes、AXI/AHB、GPIO、Sideband、PMIC、APST、LPM、Power latency。

排除條件：HMB 單獨出現可能是 HostPCIE 或 System，需要看 context。如果是 NVMe HMB feature，偏 HostPCIE；如果是 HMB to DBUF、DMAC copy、RAM arrangement，偏 System。

`SYSTEM_029` 補充界線：只有在 Evidence 顯示實際 Drive log 讀取、解析、欄位／位址／值／狀態／時序判讀，或使用 log 推導技術結論時，才建立 `SYSTEM_029` 候選。僅出現 `DriveLog`、log 檔名、要求他人提供 log、附件 metadata 或 status，不足以分類。

---

### Security Group

| Skill ID | Skill Name |
|---|---|
| SECURITY_001 | TCG |
| SECURITY_002 | DICE |
| SECURITY_003 | SPDM |
| SECURITY_004 | ATA Security |
| SECURITY_005 | SEC API |
| SECURITY_006 | Security Spec |
| SECURITY_007 | VUC Protect V5 / SP800-227 |
| SECURITY_008 | SEC HW IP |

強分類線索：TCG、Opal、Pyrite、DICE、SPDM、ATA Security、SEC API、ICV、KAT、NIST、SP800-227、MLKEM、RSA Hybrid、Security Spec。

排除條件：只有「security level」或 JIRA 權限欄位不可分類 Security。

---

### Flash Group

| Skill ID | Skill Name |
|---|---|
| FLASH_001 | FIP |
| FLASH_002 | Cop0 |
| FLASH_003 | Flash/Fphy initial |
| FLASH_004 | Patch |
| FLASH_005 | VUC |
| FLASH_006 | Andes 整體 |
| FLASH_007 | KIC 和 AIPR |
| FLASH_008 | Micron 和 IWL |
| FLASH_009 | YMTC 和 AMPI |
| FLASH_010 | Samsung 和 PIR |
| FLASH_011 | Andes Preread |
| FLASH_012 | Die interleave |
| FLASH_013 | IOR |
| FLASH_014 | BBS |
| FLASH_015 | VCA/PCA/FSA 排列和處理 |
| FLASH_016 | NAND spec 理解/熟悉度 |
| FLASH_017 | 組內 Tool/Script |
| FLASH_018 | LA 分析/Performance 相關 |

強分類線索：FIP、Cop0、Flash init、FPHY、NAND、Die interleave、IOR、BBS、VCA、PCA、FSA、KIC、Micron、YMTC、Samsung、AIPR、IWL、AMPI、PIR、NAND spec。

排除條件：只出現 QLC/TLC/Die/Plane，若 context 是 GC table size 或 performance，不一定分類 Flash，可作弱 evidence。

---

### FTLErrorHandle Group

| Skill ID | Skill Name |
|---|---|
| FTL_ERROR_HANDLE_001 | Read Fail - CopyUnit |
| FTL_ERROR_HANDLE_002 | Program Fail - CopyBlock |
| FTL_ERROR_HANDLE_003 | Program Fail - Clawback |
| FTL_ERROR_HANDLE_004 | Erase Fail |
| FTL_ERROR_HANDLE_005 | Erase Feature |
| FTL_ERROR_HANDLE_006 | VT Error Handle |
| FTL_ERROR_HANDLE_007 | InitInfo Error Handle |
| FTL_ERROR_HANDLE_008 | System Area Error Handle |
| FTL_ERROR_HANDLE_009 | Repair Unit |
| FTL_ERROR_HANDLE_010 | Error Handle with Die Interleave |
| FTL_ERROR_HANDLE_011 | NPS Verification |
| FTL_ERROR_HANDLE_012 | VUC/VS/PHSVS Gen Fail Command |
| FTL_ERROR_HANDLE_013 | Wordline Folding Handle |
| FTL_ERROR_HANDLE_014 | Boot Partition Error Handle |
| FTL_ERROR_HANDLE_015 | IO Plus |

強分類線索：Read Fail、Program Fail、Erase Fail、CopyUnit、CopyBlock、Clawback、VT Error、InitInfo、System Area、Repair Unit、RUT、DBT、NPS、Wordline Folding、Boot Partition EH。

---

### FlashErrorHandle Group

| Skill ID | Skill Name |
|---|---|
| FLASH_ERROR_HANDLE_001 | ReadVerify Main Flow |
| FLASH_ERROR_HANDLE_002 | MediaScan |
| FLASH_ERROR_HANDLE_003 | Read Disturb |
| FLASH_ERROR_HANDLE_004 | Erase/Empty Page Check |
| FLASH_ERROR_HANDLE_005 | Program 後 Read Verify |
| FLASH_ERROR_HANDLE_006 | Phison HB/SB Task |
| FLASH_ERROR_HANDLE_007 | Micron MAG EH Flow |
| FLASH_ERROR_HANDLE_008 | TurboRAIN/AdvancedRAIN 所使用的 SB API |
| FLASH_ERROR_HANDLE_009 | Nand Team Consultant |
| FLASH_ERROR_HANDLE_010 | Phison ERS |
| FLASH_ERROR_HANDLE_011 | AOM-Retry |
| FLASH_ERROR_HANDLE_012 | Refresh/MarkBad 條件 |
| FLASH_ERROR_HANDLE_013 | 各 IC Controller HW 操作/Data Flow 理解 |
| FLASH_ERROR_HANDLE_014 | vRLC |
| FLASH_ERROR_HANDLE_015 | mConfig 管理 |
| FLASH_ERROR_HANDLE_016 | UNEL 存取 |
| FLASH_ERROR_HANDLE_017 | WLL WorkloadLog 紀錄與存取 |
| FLASH_ERROR_HANDLE_018 | ERS ErrorRecovery 存取 |
| FLASH_ERROR_HANDLE_019 | 其他 MAG 項目 |
| FLASH_ERROR_HANDLE_020 | NXS 驗證 |
| FLASH_ERROR_HANDLE_021 | PPS 白箱驗證 |
| FLASH_ERROR_HANDLE_022 | General Bug 分析 |
| FLASH_ERROR_HANDLE_023 | Micron MAG Log 分析 |
| FLASH_ERROR_HANDLE_024 | 推 COP0 SQ / FIP MT 操作 |
| FLASH_ERROR_HANDLE_025 | Retention 後 / Lenovo OOBE Feature |
| FLASH_ERROR_HANDLE_026 | Multi-Retry |
| FLASH_ERROR_HANDLE_027 | Auto-Retry |
| FLASH_ERROR_HANDLE_028 | VUC 實作 |

強分類線索：ReadVerify、MediaScan、Read Disturb、Empty Page、HB/SB、Micron MAG、TurboRAIN、AdvancedRAIN、ERS、AOM-Retry、Refresh、MarkBad、vRLC、mConfig、UNEL、WLL、WorkloadLog、ErrorRecovery、Multi-Retry、Auto-Retry。

---

### Table Group

| Skill ID | Skill Name |
|---|---|
| TABLE_001 | TableUpdate |
| TABLE_002 | Trim |
| TABLE_003 | InitInfo/VT |
| TABLE_004 | SPOR |
| TABLE_005 | Table WL / Table VB / Table Perf WAF |
| TABLE_006 | Table Verification |
| TABLE_007 | General Table Bug Analysis |
| TABLE_008 | SPOR / Refresh / Sync Bug Analysis |
| TABLE_009 | Table Event / Trim / SaveVT Performance Analysis |
| TABLE_010 | FTL Flow Debug for Table |
| TABLE_011 | Table VUC Implementation |

強分類線索：TableUpdate、DTLog、TableProgram、Sync、PGD、VC、L2P、TableGC、Trim、FG Trim、BG Trim、InitInfo、VTM、VTC、SaveVT、SPOR、RefreshGR、RefreshTable、TableEvent。

排除條件：GCSA Table 是 GC context，通常不分類 Table Group，除非內容是泛 FTL table/VT/L2P/table update。

---

### RW Group

| Skill ID | Skill Name |
|---|---|
| RW_001 | DCM Read Flow |
| RW_002 | Generate RCQ |
| RW_003 | FW Read Flow |
| RW_004 | Read Queue System |
| RW_005 | COP0 Read SQ |
| RW_006 | AutoFrom |
| RW_007 | Read Completion |
| RW_008 | Inorder Read |
| RW_009 | PreRead with DCM |
| RW_010 | HW PreRead Engine |
| RW_011 | 256K preread |
| RW_012 | MultiRange preread |
| RW_013 | Same PCA |
| RW_014 | DCM Write Flow |
| RW_015 | Generate WCQ |
| RW_016 | FW Write Flow |
| RW_017 | Load Alignment |
| RW_018 | FW Insert Write |
| RW_019 | COP0 Write SQ |
| RW_020 | E31 HWACC & PKE |
| RW_021 | E33 WriteACC & PKE |
| RW_022 | GR & RS Map |
| RW_023 | BBS & PCA Rule |
| RW_024 | Journal |
| RW_025 | Dummy & WAF |
| RW_026 | SLC Pool & D1 |
| RW_027 | TLC |
| RW_028 | Static Calculation |
| RW_029 | Dynamic Analysis |
| RW_030 | Delay & Timeout |
| RW_031 | COP0 Andes Cowork |
| RW_032 | PLDM |
| RW_033 | Logic Analyzer |
| RW_034 | Protocol Analyzer |
| RW_035 | CDM |
| RW_036 | PCMARK10 |
| RW_037 | ARM CPU |
| RW_038 | ANDES CPU |
| RW_039 | Modulization |
| RW_040 | Compiler Env |
| RW_041 | HMB Reset |
| RW_042 | Data Path |
| RW_043 | Address Translation |

強分類線索：Read SQ、Read Flow、Write Flow、RCQ、WCQ、DCM、COP0 Read SQ、COP0 Write SQ、PreRead、Read Completion、Read Queue、PCA、PKE、GR/RS Map、Journal、Dummy、Data Path、Address Translation、Timeout。

排除條件：只出現 Read/Write 但 context 是 GC copy/read/program，不一定 RW；需看是否是 host/data path/RW queue。

---

### RAID Group

| Skill ID | Skill Name |
|---|---|
| RAID_001 | Map/Protection Concept |
| RAID_002 | Encode |
| RAID_003 | Decode |
| RAID_004 | RAID HW Mechanism/Register |
| RAID_005 | TurboRAID |
| RAID_006 | PKE |

強分類線索：RAID、RAID ECC、RaidECCMapSwapParityFlow、RS IP Encode、RAID parity、Encode、Decode、Protection、PKE、TurboRAID。

排除條件：若只是「詢問 RAID Group」但技術內容主要是 GC，RAID 分類應為 secondary。

---

### Debug Group

| Skill ID | Skill Name |
|---|---|
| DEBUG_001 | Bug 分析：初步分析歸類準確 |
| DEBUG_002 | Bug 分析：週報總結歸納 |
| DEBUG_003 | Bug 分析：意見與溝通能力 |
| DEBUG_004 | Bug 分析：洞察癥結、改善效率 |
| DEBUG_005 | Branch 維護：阻擋炸彈、限時排除 bug 擇優 FW 放測 |
| DEBUG_006 | Branch 維護：組態、Sample、機台、測項、人力與狀況管理 |
| DEBUG_007 | Branch 維護：修正 bug 到穩定版本 |
| DEBUG_008 | CD 自動開卡 flow |
| DEBUG_009 | Debug SOP 確立 |

強分類線索：root cause、debug、analysis、找到原因、還在分析、GPIO check、ICE dump、drive log、RMA log、branch maintenance、weekly report、SOP、triage。

排除條件：JIRA status=DEBUGGING 不足以分類 Debug；需要本人 comment 有分析過程或 debug 操作。

候選界線：

- `DEBUG_001`：Evidence 顯示初步 triage、重現、現象歸類、問題範圍縮小或基礎判讀，但尚未清楚證明根因與改善方案。
- `DEBUG_004`：Evidence 顯示根因鏈、關鍵狀態／條件推理、跨資料關聯，或提出能改善修正／驗證效率的具體方法。
- 不能因一筆內容「看起來較深入」就自動把 `DEBUG_001` 全部替換成 `DEBUG_004`；兩者須依本筆 Evidence 的分析深度分別判斷。
- 同筆 Evidence 若同時清楚呈現初步歸類與後續根因洞察，可在有獨立 signals 時同時保留；若兩者只是同一句話的重述，應選較精確者，避免重複計數。

---

### MP Group

| Skill ID | Skill Name |
|---|---|
| MP_001 | Burner 架構設計管理 |
| MP_002 | QMP 架構設計管理 |
| MP_003 | Phison Card init flow |
| MP_004 | Micron Card init flow |
| MP_005 | Preformat |
| MP_006 | SSFW/Fence FW |
| MP_007 | LLF |
| MP_008 | ISP Flash |
| MP_009 | Erase All |
| MP_010 | VUC 1.0 |
| MP_011 | VUC 3.0 |
| MP_012 | VS Micron |
| MP_013 | Gen Bin Tool 架構設計管理 |
| MP_014 | material |
| MP_015 | VUC Protection |
| MP_016 | Codesign mechanism |
| MP_017 | DLMC |
| MP_018 | IPL/Init/Loader |
| MP_019 | BootLoader |
| MP_020 | Sys/Code/IDPage/InfoBlk |
| MP_021 | DBT/RUT |
| MP_022 | VT sweep/Vth tool/NFI tool |
| MP_023 | ICE mode |

強分類線索：Burner、QMP、Card init、Preformat、SSFW、Fence FW、LLF、ISP Flash、Erase All、VUC 1.0/3.0、Gen Bin、Code signing、DLMC、IPL、Loader、BootLoader、IDPage、InfoBlk、DBT、RUT、VT sweep、Vth tool、NFI tool、ICE mode。

排除條件：JIRA custom field 出現 MP 不一定分類 MP；需看內容是否涉及 MP flow/tool/init/loader。

---

### HostPCIE Group

| Skill ID | Skill Name |
|---|---|
| HOST_PCIE_001 | Host Init task |
| HOST_PCIE_002 | Reset flow |
| HOST_PCIE_003 | Standby |
| HOST_PCIE_004 | Save/Load Host table |
| HOST_PCIE_005 | set/get Feature |
| HOST_PCIE_006 | NVME Smart/Vendor smart |
| HOST_PCIE_007 | Flush |
| HOST_PCIE_008 | Format/Sanitize |
| HOST_PCIE_009 | PLN |
| HOST_PCIE_010 | Device Self Test |
| HOST_PCIE_011 | Sync R/W |
| HOST_PCIE_012 | Verify |
| HOST_PCIE_013 | Sync Write UNC/Write Zero |
| HOST_PCIE_014 | Persistent Log |
| HOST_PCIE_015 | Boot Partition |
| HOST_PCIE_016 | WorkLoadLog |
| HOST_PCIE_017 | HMB |
| HOST_PCIE_018 | Multi Namespace |
| HOST_PCIE_019 | UNEL |
| HOST_PCIE_020 | TCI/THI/OCP/Lenovo Ellie/Dell |
| HOST_PCIE_021 | RPMB |
| HOST_PCIE_022 | VUC |
| HOST_PCIE_023 | Speed class |
| HOST_PCIE_024 | 錄 PA / 分析 Trace |
| HOST_PCIE_025 | 使用 UEFI tool |

強分類線索：NVMe、PCIe、Host Init、Reset flow、Standby、Host table、Get Feature、Set Feature、SMART、Flush、Format、Sanitize、PLN、Device Self Test、Sync R/W、Write Zero、Persistent Log、Boot Partition、WorkLoadLog、Namespace、UNEL、TCI、THI、RPMB、UEFI。

排除條件：HMB 若用於 GC/HMBtoDBUF/DMAC copy，偏 System 或 GC，不直接 HostPCIE。

---

### HostUSB Group

| Skill ID | Skill Name |
|---|---|
| HOST_USB_001 | PD FW flow |
| HOST_USB_002 | USB4 FW flow |
| HOST_USB_003 | PD/USB4 Trace 分析 |
| HOST_USB_004 | PD/USB4 Debug |
| HOST_USB_005 | PD Protocol |
| HOST_USB_006 | USB4 Protocol |
| HOST_USB_007 | USB3 INIT/ISR FW flow |
| HOST_USB_008 | USB3 CMD FW flow |
| HOST_USB_009 | USB3 Trace 分析 |
| HOST_USB_010 | USB3.2 Debug |
| HOST_USB_011 | USB3.2 Protocol |
| HOST_USB_012 | SCSI command Protocol |
| HOST_USB_013 | APU FW flow |
| HOST_USB_014 | APU Debug |
| HOST_USB_015 | PCIe/NVMe INIT/ISR FW flow |
| HOST_USB_016 | PCIe/NVMe Trace 分析 |
| HOST_USB_017 | NVMe CMD FW flow |
| HOST_USB_018 | PCIe/NVMe Debug |
| HOST_USB_019 | PCIe/NVMe Protocol |
| HOST_USB_020 | USB Security |
| HOST_USB_021 | IOR 機制 |
| HOST_USB_022 | GenT |
| HOST_USB_023 | MFi |
| HOST_USB_024 | 軟體熟悉度 |
| HOST_USB_025 | 相容性 |
| HOST_USB_026 | 與 HW/FAE 溝通 |
| HOST_USB_027 | 與其他 Group 溝通 |

強分類線索：USB、USB3、USB3.2、USB4、PD、SCSI command、APU、USB Security、GenT、MFi、USB trace、USB protocol。

---

### Tool Group

| Skill ID | Skill Name |
|---|---|
| TOOL_001 | SSD_Utility |
| TOOL_002 | RabbitX |
| TOOL_003 | Smart RMA Robot / parse tool |
| TOOL_004 | CI/CD |

強分類線索：SSD_Utility、RabbitX、Smart RMA Robot、parse tool、CI/CD、automation、script、tooling。

排除條件：JiraRobot/Rabbit 自動留下的資料不能直接算成人 Tool skill；必須看到使用者本人開發、修改、維護或設計工具。

---


## 7. 跨 Group Disambiguation（目前已知）

| 詞彙／情境 | 判斷界線 |
|---|---|
| HMB | NVMe HMB Feature 偏 HostPCIE；HMB→DBUF、DMAC copy、RAM arrangement 偏 System；GC 搬移情境可同時產生 GC 候選 |
| VUC | 必須依目的區分 Flash、FlashErrorHandle、MP、HostPCIE、Table 或 Security，不可只靠 VUC 三字分類 |
| Table | GCSA Table 通常偏 GC；VT／L2P／TableUpdate／Trim／SaveVT 才偏 Table |
| Read／Write | Host／Data Path／Queue／RCQ／WCQ 偏 RW；GC Copy Read／Program 不應自動歸 RW |
| Debug | 必須有本人分析過程、操作或 Root Cause；`status=DEBUGGING`、log 檔名不成立 |
| Tool／Automation | 必須看到本人設計、修改或維護工具；Robot 自動事件不算個人 Tool Skill |

## 8. 已補強的候選組合檢查

下列組合不是固定答案，也不是看到關鍵字就自動成立；它們是分析時不可省略的候選檢查：

| 已有候選 | 必須額外檢查 | 只有何種證據才保留 |
|---|---|---|
| `GC_006` | `GC_009` | 另有 event/queue/dispatch/scheduling/trigger 時序證據 |
| `GC_007` | `GC_011` | 另有 pause/unpause/pausing 狀態或控制證據 |
| `DEBUG_001` | `DEBUG_004` | 另有根因鏈、關鍵條件推理或效率改善證據 |
| 任一技術 Skill | `SYSTEM_029` | 實際解析 Drive log 欄位、位址、值、狀態或時序並用於判斷 |

規則：

1. 候選檢查不得變成固定加標籤。
2. 每個保留的 Skill 必須有不完全相同的 `positiveEvidence` 與針對該 Skill 的 `negativeChecks`。
3. 若只證明其中一個技術面向，只保留有證據者。
4. 若 Evidence 只是請求資料、完成通知、工作流程狀態或 context link，應優先考慮 `UNKNOWN`／`EXCLUDED`，不得為追求覆蓋率強迫分類。
5. 模型或規則引擎不得把人工範例中的 Skill 組合當成 Golden label；最終仍以當次 Evidence 與綁定規則判斷。

## 9. 待人工補齊與核准

1. 為 279 項 Skill 補齊正式 `detail_description`。
2. 將 Group 層級線索拆成每個 Skill 的 aliases／strong／medium／weak signals。
3. 補齊每個 Skill 的 negative rules、evidence fields 與 disambiguation。
4. 建立 RMA、HostSD、HostSATA、NXS 正式技能表。
5. 建立每次人工修正後的 Catalog change history。
6. 完成後將狀態由 `review-draft` 提升為 `approved`；未核准前不得將 AI 建議寫回正式 Catalog。

## 10. Change History

| Version | Date | Status | Change |
|---|---|---|---|
| 0.3.1 | 2026-08-14 | review-draft | 不變更 279 項 Skill ID；補強 GC 同 Group 多技能、DEBUG_001／DEBUG_004、SYSTEM_029 與 Evidence-specific multi-skill 邊界 |
| 0.3.0 | 2026-08-06 | review-draft | 由 v0.2 移植包整理為獨立 Catalog；保留 279 項既有 Skill ID，新增 Schema、完整度與待補標示 |
