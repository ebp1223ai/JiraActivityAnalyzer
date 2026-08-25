const fs = require("node:fs");
const path = require("node:path");
const { api } = require("./v0337-test-helpers.cjs");
const root = process.env.JAA_V0336_REPLAY_ROOT;
if (!root) {
  console.log(JSON.stringify({ status: "NOT_RUN", reason: "JAA_V0336_REPLAY_ROOT is not set; sensitive Debug Bundle was not opened automatically.", providerContacted: false, tokenDelta: 0, productionSqliteWritten: false, activeResultReplaced: false }));
  process.exit(0);
}
const m = api(); const runId = "analysis_41d05e5a-7386-4d2b-b3c0-1164c4798452";
const paths = m.discoverArtifactTruthPathsV0337(path.resolve(root));
if (!paths) throw new Error("V0336_REPLAY_ARTIFACT_NOT_FOUND");
const truth = m.resolveDurableArtifactTruthV0337(runId, paths);
if (truth.artifactSha256 !== "5540f1a4a0227cd51d8e2ff3ffafc747be99c52eb4a4dd49b780e9b2e8b34322") throw new Error(`V0336_REPLAY_ARTIFACT_HASH_MISMATCH:${truth.artifactSha256}`);
if (truth.status !== "PERSISTED_VALID") throw new Error(`V0336_REPLAY_RESOLVER_STATUS:${truth.status}`);
const oldTerminalPath = path.join(path.resolve(root), "progress", "run-terminal.json"); const oldTerminal = fs.existsSync(oldTerminalPath) ? JSON.parse(fs.readFileSync(oldTerminalPath, "utf8")) : null;
console.log(JSON.stringify({ status: "PASS", runId, artifactSha256: truth.artifactSha256, resolverStatus: truth.status, oldTerminal, providerContacted: false, tokenDelta: 0, productionSqliteWritten: false, activeResultReplaced: false }));