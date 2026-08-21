import type { AiRuleDocumentRole, AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import {
  RuleSelectionTransactionServiceV0326,
  V0326_RULE_BINDING,
  V0326_RULE_FILES,
  bundledRuleSelectionV0326,
  loadExplicitRulesSnapshotV0326,
  normalizeRuleSelectionErrorV0326,
  type RuleSelectionV0326
} from "./aiAnalysisRulesV0326.js";

// The v0.3.27 app consumes the byte-identical v0.3.26 rule-document contract.
// Keep document validation truthful while exposing the current host pipeline identity.
export const V0327_APPLICATION_BINDING = {
  applicationVersion: "0.3.27",
  promptVersion: "JAA-CHATGPT-ZH-TW-0.3.27",
  pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.27",
  bridgeVersion: "0.3.27-bridge-v9"
} as const;

export const V0327_RULE_DOCUMENT_BINDING = V0326_RULE_BINDING;
export const V0327_RULE_FILES = V0326_RULE_FILES;
export type RuleSelectionV0327 = RuleSelectionV0326;

function withApplicationIdentity(snapshot: AiRulesSnapshot | null): AiRulesSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    rulesDirectoryLabel: snapshot.selectionMode === "BUNDLED_DEFAULT" ? "Bundled v0.3.27" : "Manual explicit v0.3.27",
    promptVersion: V0327_APPLICATION_BINDING.promptVersion,
    pipelineVersion: V0327_APPLICATION_BINDING.pipelineVersion
  };
}

export function bundledRuleSelectionV0327(directory: string): RuleSelectionV0327 {
  return bundledRuleSelectionV0326(directory);
}

export function loadExplicitRulesSnapshotV0327(selection: RuleSelectionV0327): AiRulesSnapshot {
  return withApplicationIdentity(loadExplicitRulesSnapshotV0326(selection))!;
}

export const normalizeRuleSelectionErrorV0327 = normalizeRuleSelectionErrorV0326;

export class RuleSelectionTransactionServiceV0327 {
  private readonly legacy: RuleSelectionTransactionServiceV0326;

  constructor(bundledDirectory: string, storageDirectory: string) {
    this.legacy = new RuleSelectionTransactionServiceV0326(bundledDirectory, storageDirectory);
  }

  get rules() { return withApplicationIdentity(this.legacy.rules); }
  get transaction() { return this.legacy.transaction; }
  selectRole(role: AiRuleDocumentRole, selectedPath: string) { return this.legacy.selectRole(role, selectedPath); }
  cancelDraft() { return this.legacy.cancelDraft(); }
  useBundled(cause = "USER_SELECTED_BUNDLED") { return this.legacy.useBundled(cause); }
  revalidate() { return withApplicationIdentity(this.legacy.revalidate())!; }
}
