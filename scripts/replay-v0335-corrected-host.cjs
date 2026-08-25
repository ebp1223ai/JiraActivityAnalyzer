const fs = require("node:fs"); const path = require("node:path");
const root = process.env.JAA_V0335_REPLAY_ROOT ? path.resolve(process.env.JAA_V0335_REPLAY_ROOT) : null;
if (!root || !fs.existsSync(root)) { console.log(JSON.stringify({ status: "NOT_RUN", reason: "JAA_V0335_REPLAY_ROOT was not provided; corrected-host replay cannot claim PASS without real immutable Artifact bytes.", providerCalled: false, productionSqliteWritten: false, sqliteReceipt: "NOT_RUN_BY_TEST_ISOLATION" })); process.exit(0); }
throw new Error("CORRECTED_HOST_REPLAY_REQUIRES_EXPLICIT_ISOLATED_FIXTURE_ADAPTER");