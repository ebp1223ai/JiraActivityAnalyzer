export const AI_INSTRUCTION_MODES = [
  "STANDARD_FORMAL",
  "STANDARD_PLUS_USER_INSTRUCTION",
  "CUSTOM_DIAGNOSTIC"
] as const;

export type AiInstructionMode = typeof AI_INSTRUCTION_MODES[number];

export type AiInstructionComposition = {
  schemaVersion: "jaa-instruction-composition-v1";
  mode: AiInstructionMode;
  effectiveInstruction: string;
  effectiveInstructionSha256: string;
  effectiveInstructionBytes: number;
  formalArtifactEligible: boolean;
  sqliteEligible: boolean;
  transportProtocol: "bridge-resumable-v2";
  sections: Array<{ id: string; applicable: boolean; sha256: string; bytes: number }>;
};
