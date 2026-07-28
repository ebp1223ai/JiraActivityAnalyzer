import assert from "node:assert/strict";
import { defaultCompleteCoverage } from "./coverageProfile.js";
import {
  buildStableIssueContentV3,
  resolveEffectiveStableHashPolicyV3,
  stablePolicyFingerprint,
  STABLE_HASH_POLICY_VERSION
} from "./stableIssueContentV3.js";

const raw = {
  issue: {
    id: "241",
    key: "SYN-241",
    names: { customfield_13200: "Debug Time", customfield_50000: "Business Field" },
    schema: {
      customfield_13200: { type: "number", custom: "synthetic:field" },
      customfield_50000: { type: "string", custom: "synthetic:field" }
    },
    fields: {
      summary: "Historical Stable Hash V3 fixture",
      updated: "2026-07-28T00:00:00.000Z",
      lastViewed: "2026-07-28T00:01:00.000Z",
      customfield_13200: 10,
      customfield_50000: "stable"
    }
  },
  changelog: [],
  comments: [],
  attachments: [],
  issueLinks: [],
  remoteLinks: []
};
const coverage = defaultCompleteCoverage({
  changelog: 0,
  comments: 0,
  attachments: 0,
  issueLinks: 0,
  remoteLinksEnabled: false,
  remoteLinks: 0
});
const resolved = resolveEffectiveStableHashPolicyV3(raw.issue.names, raw.issue.schema);
assert.equal(STABLE_HASH_POLICY_VERSION, 3);
assert.equal(resolved.policy.policyVersion, 3);
assert.equal(stablePolicyFingerprint(resolved.policy).fingerprint, resolved.fingerprint);

const baseline = buildStableIssueContentV3(raw, coverage, resolved.policy, "synthetic-jira-v0241");
const metricOnly = structuredClone(raw);
metricOnly.issue.fields.customfield_13200 = 999;
metricOnly.issue.fields.lastViewed = "2026-07-29T00:01:00.000Z";
assert.equal(
  buildStableIssueContentV3(metricOnly, coverage, resolved.policy, "synthetic-jira-v0241").stableHash,
  baseline.stableHash
);

const meaningful = structuredClone(raw);
meaningful.issue.fields.customfield_50000 = "changed";
assert.notEqual(
  buildStableIssueContentV3(meaningful, coverage, resolved.policy, "synthetic-jira-v0241").stableHash,
  baseline.stableHash
);

console.log("v0.2.41 historical Stable Hash V3 policy tests passed.");
