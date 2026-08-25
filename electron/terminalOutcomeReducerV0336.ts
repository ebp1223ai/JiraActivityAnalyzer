export const TERMINAL_OUTCOME_REDUCER_VERSION_V0336 = "jaa-terminal-outcome-reducer-v1" as const;

export type ProviderTerminalV0336 = "completed" | "failed" | "cancelled" | null;
export type TerminalOutcomeV0336 = "CONTINUE_POST_ARTIFACT" | "SUCCEEDED" | "FAILED_POST_ARTIFACT" | "FAILED_NO_ARTIFACT" | "FAILED_PROVIDER" | "CANCELLED" | "WAITING_FOR_FACTS";
export type TerminalReducerInputV0336 = Readonly<{
  providerTerminal: ProviderTerminalV0336;
  durableArtifactPersisted: boolean;
  artifactSha256: string | null;
  contentValidationFailed: boolean;
  postArtifactTerminalOutcome: "SUCCEEDED" | "FAILED" | null;
}>;

export function reduceTerminalOutcomeV0336(input: TerminalReducerInputV0336) {
  let outcome: TerminalOutcomeV0336 = "WAITING_FOR_FACTS";
  if (input.durableArtifactPersisted) {
    outcome = input.postArtifactTerminalOutcome === "SUCCEEDED" ? "SUCCEEDED"
      : input.postArtifactTerminalOutcome === "FAILED" || input.contentValidationFailed ? "FAILED_POST_ARTIFACT"
      : "CONTINUE_POST_ARTIFACT";
  } else if (input.providerTerminal === "completed") outcome = "FAILED_NO_ARTIFACT";
  else if (input.providerTerminal === "failed") outcome = "FAILED_PROVIDER";
  else if (input.providerTerminal === "cancelled") outcome = "CANCELLED";
  return Object.freeze({
    schemaVersion: TERMINAL_OUTCOME_REDUCER_VERSION_V0336, outcome,
    analysisStarted: input.durableArtifactPersisted, analysisCompleted: input.durableArtifactPersisted,
    analysisTelemetry: input.durableArtifactPersisted ? "COMPLETED_BY_ARTIFACT" as const : "NOT_REPORTED" as const,
    providerWarning: input.durableArtifactPersisted && input.providerTerminal && input.providerTerminal !== "completed" ? `PROVIDER_${input.providerTerminal.toUpperCase()}_AFTER_ARTIFACT` : null,
    rootErrorCode: outcome === "FAILED_NO_ARTIFACT" ? "AI_ARTIFACT_SUBMISSION_MISSING" : outcome === "FAILED_PROVIDER" ? "CHATGPT_TURN_FAILED" : outcome === "CANCELLED" ? "RUN_CANCELLED" : outcome === "FAILED_POST_ARTIFACT" ? "AI_POST_ARTIFACT_PIPELINE_FAILED" : null,
    input
  });
}