if (process.env.JAA_ENABLE_LIVE_PROVIDER_TEST !== "1") {
  console.log(JSON.stringify({ status: "NOT_RUN", reason: "JAA_ENABLE_LIVE_PROVIDER_TEST=1 is required.", providerContacted: false, tokenTelemetry: "unavailable", productionSqliteWritten: false, activeResultReplaced: false }));
  process.exit(0);
}
const required = ["JAA_LIVE_PENDING_JSON", "JAA_LIVE_RULE_MANIFEST", "JAA_LIVE_COMMON_RULES", "JAA_LIVE_SKILL_CATALOG", "JAA_LIVE_HTML_TEMPLATE"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) { console.log(JSON.stringify({ status: "NOT_RUN", reason: `Missing prerequisites: ${missing.join(",")}`, providerContacted: false, tokenTelemetry: "unavailable", productionSqliteWritten: false, activeResultReplaced: false })); process.exit(0); }
console.error("LIVE_PROVIDER_RUNNER_REQUIRES_APP_MANAGED_OAUTH_SESSION"); process.exit(2);