import type { AiRuleDocumentRole, AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import {
  RuleSelectionTransactionServiceV0327,
  V0327_RULE_DOCUMENT_BINDING,
  V0327_RULE_FILES,
  bundledRuleSelectionV0327,
  loadExplicitRulesSnapshotV0327,
  normalizeRuleSelectionErrorV0327,
  type RuleSelectionV0327
} from "./aiAnalysisRulesV0327.js";

export const V0328_APPLICATION_BINDING = {
  applicationVersion: "0.3.28",
  promptVersion: "JAA-CHATGPT-ZH-TW-0.3.28",
  pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.28",
  bridgeVersion: "0.3.28-bridge-v10"
} as const;

export const V0328_RULE_DOCUMENT_BINDING = V0327_RULE_DOCUMENT_BINDING;
export const V0328_RULE_FILES = V0327_RULE_FILES;
export type RuleSelectionV0328 = RuleSelectionV0327;

function withApplicationIdentity(snapshot: AiRulesSnapshot | null): AiRulesSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    rulesDirectoryLabel: snapshot.selectionMode === "BUNDLED_DEFAULT" ? "Bundled v0.3.28" : "Manual explicit v0.3.28",
    promptVersion: V0328_APPLICATION_BINDING.promptVersion,
    pipelineVersion: V0328_APPLICATION_BINDING.pipelineVersion
  };
}

export const bundledRuleSelectionV0328 = bundledRuleSelectionV0327;
export function loadExplicitRulesSnapshotV0328(selection: RuleSelectionV0328) {
  return withApplicationIdentity(loadExplicitRulesSnapshotV0327(selection))!;
}
export const normalizeRuleSelectionErrorV0328 = normalizeRuleSelectionErrorV0327;

export class RuleSelectionTransactionServiceV0328 {
  private readonly legacy: RuleSelectionTransactionServiceV0327;
  constructor(bundledDirectory: string, storageDirectory: string) {
    this.legacy = new RuleSelectionTransactionServiceV0327(bundledDirectory, storageDirectory);
  }
  get rules() { return withApplicationIdentity(this.legacy.rules); }
  get transaction() { return this.legacy.transaction; }
  selectRole(role: AiRuleDocumentRole, selectedPath: string) { return this.legacy.selectRole(role, selectedPath); }
  cancelDraft() { return this.legacy.cancelDraft(); }
  useBundled(cause = "USER_SELECTED_BUNDLED") { return this.legacy.useBundled(cause); }
  revalidate() { return withApplicationIdentity(this.legacy.revalidate())!; }
}
