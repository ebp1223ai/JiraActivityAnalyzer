import type { AnalysisBasisFile, AnalysisResultRow, AnalyzedDataset, DiagnosticStep, PendingDataset } from "./types";

export const analysisBasisFiles: AnalysisBasisFile[] = [
  { kind: "catalog", fileName: "Skill_Catalog_v0.3.0.md", version: "0.3.0", sha256: "e7a18c5f...7c01", status: "verified" },
  { kind: "rules", fileName: "Skill_Classification_Common_Rules_v1.1.0.md", version: "1.1.0", sha256: "b4d90ee2...392a", status: "verified" },
  { kind: "manifest", fileName: "Skill_Analysis_Rule_Set_Manifest.md", version: "review-draft", sha256: "61f8791c...d883", status: "verified" }
];

export const diagnosticStepTemplate: DiagnosticStep[] = [
  ["configuration", "設定檢查", "Provider、Endpoint、Model 與 API Contract 已填寫"],
  ["network", "網路連線", "模擬 DNS 與服務路徑檢查"],
  ["tls", "TLS／傳輸檢查", "模擬憑證與傳輸協定檢查"],
  ["authentication", "驗證", "憑證值已遮罩，不寫入診斷物件"],
  ["model", "模型可用性", "模擬指定模型查詢"],
  ["contract", "最小請求與回應契約", "固定非機密 Prompt 與 JSON contract"],
  ["persistence", "診斷紀錄落盤檢查", "本輪僅模擬檔案清單，不執行寫檔"]
].map(([id, name, message]) => ({ id, name, status: "pending", startedAt: null, completedAt: null, durationMs: null, errorCategory: null, message, requestSummary: "Sanitized fixed diagnostic request", responseSummary: "Mock response pending" }));

const previews = [
  { id: "AE-DEMO-33802", issueKey: "SYNTH-145840", actor: "Demo User", field: "Description", occurredAt: "2026-08-08 16:42", summary: "補上 abnormal power loss 後 mapping table recovery 的邊界條件與錯誤處理流程。", added: 8, deleted: 2 },
  { id: "AE-DEMO-33796", issueKey: "SYNTH-145812", actor: "Demo User", field: "Comment", occurredAt: "2026-08-08 15:18", summary: "依 trace 比對 queue depth 與 latency spike，整理 command scheduling 的觀察。", added: 6, deleted: 0 },
  { id: "AE-DEMO-33761", issueKey: "SYNTH-4316", actor: "Sample Engineer", field: "Comment", occurredAt: "2026-08-07 18:05", summary: "確認 reset sequence 與 controller state transition 的相依順序。", added: 3, deleted: 0 },
  { id: "AE-DEMO-33742", issueKey: "SYNTH-144603", actor: "Sample Engineer", field: "Description", occurredAt: "2026-08-07 14:23", summary: "重整 read retry flow，加入不同 NAND profile 的參數選擇與回退策略。", added: 12, deleted: 4 }
];

export const pendingDatasetFixtures: PendingDataset[] = [
  { id: "pending-user-events", fileName: "pending-analysis_user-all-activity-events_20260810_171729_058c6544.json", fileType: "pending", subject: "Demo User · Selected Activity Events", dateRange: "2026/07/01 – 2026/08/10", eventCount: 117, issueCount: 43, projectCount: 3, jiraServer: "jira.example.internal", sourceDatabase: "db_7f3a...91c2", integrity: "verified", importedAt: "今天 10:31", previews },
  { id: "pending-sprint", fileName: "pending-analysis-synthetic-sprint31.json", fileType: "pending", subject: "SYNTH · Sprint 31", dateRange: "2026/07/15 – 2026/08/10", eventCount: 38, issueCount: 14, projectCount: 1, jiraServer: "jira.example.internal", sourceDatabase: "db_33ca...d104", integrity: "verified", importedAt: "昨天 17:42", previews: previews.slice(0, 3) }
];

export const analysisRecordsFixture: AnalysisResultRow[] = [
  { id: "AE-DEMO-33802", evidenceId: "EVIDENCE-DEMO-001", issueKey: "SYNTH-145840", actor: "Demo User", sourceType: "Description", occurredAt: "2026-08-08 16:42", diffSummary: "+8 / -2 lines · mapping table recovery boundary", fullDiff: "- Return after recovery failure\n+ Record recovery reason and retry boundary\n+ Validate mapping table generation before resume", positiveEvidence: ["明確描述 recovery 邊界與錯誤處理", "包含可追溯的技術變更"], negativeEvidence: ["Catalog detail 尚未完成人工核准"], matchedRules: ["strong technical action", "direct implementation evidence"], traceId: "TRACE-DEMO-001", disposition: "candidate", dispositionLabel: "技能候選", skills: [
    { skillId: "TABLE_008", skillName: "SPOR / Refresh / Sync Bug Analysis", group: "Table", score: 94, confidence: "high", status: "CATALOG_DETAIL_MISSING", reason: "Diff 涵蓋 recovery 與 table generation 邊界。" },
    { skillId: "DEBUG_001", skillName: "Bug 分析：初步分析歸類準確", group: "Debug", score: 86, confidence: "medium", status: "CATALOG_DETAIL_MISSING", reason: "具有 root cause 與修正步驟。" }
  ] },
  { id: "AE-DEMO-33796", evidenceId: "EVIDENCE-DEMO-002", issueKey: "SYNTH-145812", actor: "Demo User", sourceType: "Comment", occurredAt: "2026-08-08 15:18", diffSummary: "+6 / -0 lines · queue latency investigation", fullDiff: "+ Compare queue depth and latency traces\n+ Propose scheduling verification", positiveEvidence: ["提供量測觀察與驗證方向"], negativeEvidence: ["尚缺實作或最終結論"], matchedRules: ["investigation evidence", "human review required"], traceId: "TRACE-DEMO-002", disposition: "needs_review", dispositionLabel: "需要覆核", skills: [
    { skillId: "DEBUG_001", skillName: "Bug 分析：初步分析歸類準確", group: "Debug", score: 78, confidence: "medium", status: "NEEDS_REVIEW", reason: "分析證據存在，但需要確認是否由本人完成。" }
  ] },
  { id: "AE-DEMO-33761", evidenceId: "EVIDENCE-DEMO-003", issueKey: "SYNTH-4316", actor: "Sample Engineer", sourceType: "Comment", occurredAt: "2026-08-07 18:05", diffSummary: "+3 / -0 lines · reset sequence note", fullDiff: "+ Confirm reset sequence ordering", positiveEvidence: [], negativeEvidence: ["僅為確認性文字，缺少實作證據"], matchedRules: ["weak evidence only"], traceId: "TRACE-DEMO-003", disposition: "excluded", dispositionLabel: "已排除", skills: [] },
  { id: "AE-DEMO-33742", evidenceId: "EVIDENCE-DEMO-004", issueKey: "SYNTH-144603", actor: "Sample Engineer", sourceType: "Description", occurredAt: "2026-08-07 14:23", diffSummary: "+12 / -4 lines · read retry strategy", fullDiff: "- One fixed retry profile\n+ Select profile by NAND capability\n+ Add deterministic fallback", positiveEvidence: ["具體修改 retry flow 與 fallback"], negativeEvidence: ["Catalog detail 尚待補齊"], matchedRules: ["direct implementation evidence"], traceId: "TRACE-DEMO-004", disposition: "candidate", dispositionLabel: "技能候選", skills: [
    { skillId: "FLASH_014", skillName: "NAND Characterization", group: "Flash", score: 89, confidence: "high", status: "CATALOG_DETAIL_MISSING", reason: "修改 NAND profile 選擇與 fallback。" },
    { skillId: "RW_013", skillName: "Read Retry", group: "RW", score: 84, confidence: "medium", status: "CATALOG_DETAIL_MISSING", reason: "Diff 直接涉及 read retry flow。" }
  ] }
];

export const analyzedDatasetFixture: AnalyzedDataset = {
  id: "analyzed-user-events",
  fileName: "分析-pending-analysis_user-all-activity-events_20260810_171729_058c6544.json",
  fileType: "analyzed",
  status: "completed",
  sourcePendingFileName: pendingDatasetFixtures[0].fileName,
  subject: "Demo User · Selected Activity Events",
  dateRange: "2026/07/01 – 2026/08/10",
  eventCount: 117,
  diffCount: 117,
  issueCount: 43,
  projectCount: 3,
  jiraServer: "jira.example.internal",
  sourceDatabase: "db_7f3a...91c2",
  integrity: "verified",
  importedAt: "昨天 16:18",
  progress: 100,
  currentStep: "已分析完畢",
  snapshot: { mode: "cloud", provider: "OpenAI Cloud", model: "GPT-5", settingsVersion: 3, basisVersions: analysisBasisFiles.map((item) => item.version), basisHashes: analysisBasisFiles.map((item) => item.sha256) },
  records: analysisRecordsFixture.map((item) => ({ ...item, skills: item.skills.map((skill) => ({ ...skill })) })),
  summary: { analysisResultCount: 190, skillCandidateDiffCount: 66, needsReviewCount: 10, excludedOrUnknownCount: 41, catalogSkillCount: 279 }
};
