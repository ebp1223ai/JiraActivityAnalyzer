import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const PACKAGED_BRIDGE_SCHEMA = "jaa-packaged-analysis-bridge-manifest-v1" as const;
export const BRIDGE_RESOLVER_SCHEMA = "jaa-packaged-analysis-bridge-resolver-v1" as const;
export const BRIDGE_PREFLIGHT_SCHEMA = "jaa-analysis-bridge-preflight-receipt-v1" as const;
export const BRIDGE_IDENTITY_V0331 = "0.3.31-bridge-v13" as const;
export const BRIDGE_ARTIFACT_V0331 = "analysis-bridge-v0331.cjs" as const;
export const BRIDGE_MANIFEST_V0331 = "analysis-bridge-manifest-v0331.json" as const;
export const BRIDGE_RESOURCE_DIRECTORY = "jaa-analysis-bridge" as const;

export type BridgeRootErrorCode =
  | "AI_BRIDGE_MANIFEST_MISSING" | "AI_BRIDGE_MANIFEST_INVALID"
  | "AI_BRIDGE_PACKAGED_ARTIFACT_MISSING" | "AI_BRIDGE_PACKAGED_ARTIFACT_NOT_FILE"
  | "AI_BRIDGE_PACKAGED_ARTIFACT_UNREADABLE" | "AI_BRIDGE_VERSION_MISMATCH"
  | "AI_BRIDGE_SIZE_MISMATCH" | "AI_BRIDGE_SHA256_MISMATCH"
  | "AI_BRIDGE_LOADABILITY_FAILED" | "AI_BRIDGE_CONTRACT_MISMATCH";

export type PackagedBridgeManifestV0331 = {
  schemaVersion: typeof PACKAGED_BRIDGE_SCHEMA;
  bridgeIdentity: typeof BRIDGE_IDENTITY_V0331;
  artifactFileName: typeof BRIDGE_ARTIFACT_V0331;
  artifactBytes: number;
  artifactSha256: string;
  runtimeContractRegistry: "jaa-runtime-contract-registry-v1";
  transport: "bridge-resumable-v4";
  decisionContract: "jaa-ai-analysis-decisions-v5";
  segmentSchema: "jaa-model-input-segment-v3";
  segmentPlanner: "jaa-protected-token-safe-segment-planner-v1";
  boundaryReceipt: "jaa-segment-boundary-safety-receipt-v1";
  localOnly: true;
  externalFallback: false;
};

export type BridgePreflightReceiptV0331 = {
  schemaVersion: typeof BRIDGE_PREFLIGHT_SCHEMA;
  resolverSchemaVersion: typeof BRIDGE_RESOLVER_SCHEMA;
  phase: "startup" | "analysis_start" | "diagnostic";
  attemptId: string | null;
  appIsPackaged: boolean;
  distributionKind: "portable" | "installer" | "win-unpacked" | "development";
  processResourcesPath: string;
  expectedRelativePath: string;
  resolvedAbsolutePath: string | null;
  manifestAbsolutePath: string;
  expectedBridgeIdentity: typeof BRIDGE_IDENTITY_V0331;
  observedBridgeIdentity: string | null;
  expectedBytes: number;
  observedBytes: number;
  expectedSha256: string;
  observedSha256: string | null;
  manifestValidated: boolean;
  artifactValidated: boolean;
  loadabilityValidated: boolean;
  externalFallbackUsed: false;
  status: "ready" | "failed";
  rootErrorCode: BridgeRootErrorCode | null;
  rootErrorMessage: string | null;
  createdAtUtc: string;
};

export type BridgeRuntimeContextV0331 = {
  appIsPackaged: boolean;
  processResourcesPath: string;
  developmentResourcesPath?: string;
  distributionKind?: BridgePreflightReceiptV0331["distributionKind"];
  phase: BridgePreflightReceiptV0331["phase"];
  attemptId?: string | null;
  expectedBytes?: number;
  expectedSha256?: string;
};

const requireLocal = createRequire(__filename);
const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
const failure = (code: BridgeRootErrorCode, message: string) => Object.assign(new Error(`${code}:${message}`), { code });

export function bridgeDistributionKindV0331(appIsPackaged: boolean): BridgePreflightReceiptV0331["distributionKind"] {
  if (!appIsPackaged) return "development";
  if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) return "portable";
  return process.env.JAA_DISTRIBUTION_KIND === "installer" ? "installer" : "win-unpacked";
}

export function resolveAnalysisBridgeArtifactV0331(context: BridgeRuntimeContextV0331) {
  const root = context.appIsPackaged ? context.processResourcesPath : context.developmentResourcesPath;
  if (!root) throw failure("AI_BRIDGE_MANIFEST_MISSING", "Development Bridge resource path was not provided.");
  const resourceDirectory = path.resolve(root, BRIDGE_RESOURCE_DIRECTORY);
  const artifactPath = path.join(resourceDirectory, BRIDGE_ARTIFACT_V0331);
  const manifestPath = path.join(resourceDirectory, BRIDGE_MANIFEST_V0331);
  const expectedBytes = context.expectedBytes ?? (typeof __JAA_ANALYSIS_BRIDGE_BYTES__ === "undefined" ? 0 : __JAA_ANALYSIS_BRIDGE_BYTES__);
  const expectedSha256 = (context.expectedSha256 ?? (typeof __JAA_ANALYSIS_BRIDGE_SHA256__ === "undefined" ? "" : __JAA_ANALYSIS_BRIDGE_SHA256__)).toLowerCase();
  const receipt: BridgePreflightReceiptV0331 = {
    schemaVersion: BRIDGE_PREFLIGHT_SCHEMA, resolverSchemaVersion: BRIDGE_RESOLVER_SCHEMA,
    phase: context.phase, attemptId: context.attemptId ?? null, appIsPackaged: context.appIsPackaged,
    distributionKind: context.distributionKind ?? bridgeDistributionKindV0331(context.appIsPackaged),
    processResourcesPath: context.processResourcesPath,
    expectedRelativePath: `${BRIDGE_RESOURCE_DIRECTORY}/${BRIDGE_ARTIFACT_V0331}`,
    resolvedAbsolutePath: null, manifestAbsolutePath: manifestPath,
    expectedBridgeIdentity: BRIDGE_IDENTITY_V0331, observedBridgeIdentity: null,
    expectedBytes, observedBytes: 0, expectedSha256, observedSha256: null,
    manifestValidated: false, artifactValidated: false, loadabilityValidated: false,
    externalFallbackUsed: false, status: "failed", rootErrorCode: null, rootErrorMessage: null,
    createdAtUtc: new Date().toISOString()
  };
  try {
    if (!fs.existsSync(manifestPath)) throw failure("AI_BRIDGE_MANIFEST_MISSING", `Bridge manifest is missing: ${manifestPath}`);
    let manifest: PackagedBridgeManifestV0331;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PackagedBridgeManifestV0331; }
    catch { throw failure("AI_BRIDGE_MANIFEST_INVALID", "Bridge manifest is not valid strict UTF-8 JSON."); }
    receipt.observedBridgeIdentity = String(manifest.bridgeIdentity ?? "") || null;
    if (manifest.schemaVersion !== PACKAGED_BRIDGE_SCHEMA || manifest.bridgeIdentity !== BRIDGE_IDENTITY_V0331 || manifest.artifactFileName !== BRIDGE_ARTIFACT_V0331) throw failure("AI_BRIDGE_VERSION_MISMATCH", "Bridge manifest identity or artifact filename does not match v0.3.31.");
    if (manifest.runtimeContractRegistry !== "jaa-runtime-contract-registry-v1" || manifest.transport !== "bridge-resumable-v4" || manifest.decisionContract !== "jaa-ai-analysis-decisions-v5" || manifest.segmentSchema !== "jaa-model-input-segment-v3" || manifest.segmentPlanner !== "jaa-protected-token-safe-segment-planner-v1" || manifest.boundaryReceipt !== "jaa-segment-boundary-safety-receipt-v1" || manifest.localOnly !== true || manifest.externalFallback !== false) throw failure("AI_BRIDGE_CONTRACT_MISMATCH", "Bridge manifest runtime contract does not match v0.3.31.");
    if (!expectedBytes || !expectedSha256 || manifest.artifactBytes !== expectedBytes || manifest.artifactSha256.toLowerCase() !== expectedSha256) throw failure(manifest.artifactBytes !== expectedBytes ? "AI_BRIDGE_SIZE_MISMATCH" : "AI_BRIDGE_SHA256_MISMATCH", "Packaged manifest does not match the build-time Bridge identity.");
    receipt.manifestValidated = true;
    if (!fs.existsSync(artifactPath)) throw failure("AI_BRIDGE_PACKAGED_ARTIFACT_MISSING", `Bridge artifact is missing: ${artifactPath}`);
    const stat = fs.statSync(artifactPath);
    if (!stat.isFile()) throw failure("AI_BRIDGE_PACKAGED_ARTIFACT_NOT_FILE", "Bridge artifact path is not a regular file.");
    receipt.resolvedAbsolutePath = artifactPath; receipt.observedBytes = stat.size;
    let bytes: Buffer; try { bytes = fs.readFileSync(artifactPath); } catch { throw failure("AI_BRIDGE_PACKAGED_ARTIFACT_UNREADABLE", "Bridge artifact cannot be read."); }
    receipt.observedSha256 = sha256(bytes);
    if (stat.size !== expectedBytes) throw failure("AI_BRIDGE_SIZE_MISMATCH", "Bridge artifact byte length does not match build identity.");
    if (receipt.observedSha256 !== expectedSha256) throw failure("AI_BRIDGE_SHA256_MISMATCH", "Bridge artifact SHA-256 does not match build identity.");
    receipt.artifactValidated = true;
    let runtime: { createAnalysisBridge?: unknown };
    try { delete requireLocal.cache?.[artifactPath]; runtime = requireLocal(artifactPath) as { createAnalysisBridge?: unknown }; }
    catch { throw failure("AI_BRIDGE_LOADABILITY_FAILED", "Bridge artifact could not be loaded by the production CommonJS loader."); }
    if (typeof runtime.createAnalysisBridge !== "function") throw failure("AI_BRIDGE_LOADABILITY_FAILED", "Bridge artifact does not export createAnalysisBridge.");
    receipt.loadabilityValidated = true; receipt.status = "ready";
    return { receipt, manifest, artifactPath, manifestPath, runtime };
  } catch (error) {
    const code = (error as { code?: BridgeRootErrorCode }).code ?? "AI_BRIDGE_MANIFEST_INVALID";
    receipt.rootErrorCode = code; receipt.rootErrorMessage = error instanceof Error ? error.message.replace(/^[A-Z0-9_]+:/, "") : String(error);
    return { receipt, manifest: null, artifactPath, manifestPath, runtime: null };
  }
}

declare const __JAA_ANALYSIS_BRIDGE_BYTES__: number;
declare const __JAA_ANALYSIS_BRIDGE_SHA256__: string;
