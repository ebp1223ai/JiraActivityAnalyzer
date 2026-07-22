import assert from "node:assert/strict";
import { durationStats, executeActivityStreamBenchmark, summarizeBenchmark, type ActivityStreamBenchmarkSample } from "./activityStreamBenchmark.js";
import { classifyActivityStreamResult } from "./activityStreamRoundStability.js";

const stats = durationStats([10, 20, 30, 40, 100]);
assert.deepEqual(stats, { min: 10, median: 30, average: 40, p90: 100, max: 100 });

const sample = (runNumber: number, classification: ActivityStreamBenchmarkSample["resultClassification"]): ActivityStreamBenchmarkSample => ({ runNumber, startTime: "2026-07-01T00:00:00.000Z", endTime: "2026-07-01T00:00:01.000Z", logicalDurationMs: 100, physicalHttpRequestCount: 1, httpDurationMs: 90, processingDurationMs: 10, httpStatus: classification.startsWith("http_200") ? "200" : "-", responseBytes: 512, atomEntryCount: 2, parsedEventCount: 2, timeout: classification === "timeout", resultClassification: classification, physicalRequests: [] });
assert.equal(summarizeBenchmark([sample(1, "http_200_with_entries"), sample(2, "timeout")]).timeoutCount, 1);
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 1, parsedEventCount: 1, responseBytes: 20 }), "http_200_with_entries");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 20 }), "http_200_no_entries");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 0 }), "empty_response");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 10, timeout: true }), "timeout");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 10, aborted: true }), "aborted");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 10, errorType: "partial_response" }), "partial_response");
assert.equal(classifyActivityStreamResult({ httpStatus: "200", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 10, errorType: "parse_failed" }), "parse_failed");
assert.equal(classifyActivityStreamResult({ httpStatus: "-", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 0, errorType: "network_error" }), "network_error");
assert.equal(classifyActivityStreamResult({ httpStatus: "500", atomEntryCount: 0, parsedEventCount: 0, responseBytes: 10 }), "http_error");

async function main() {
  let cancelled = false;
  const run = await executeActivityStreamBenchmark({ selectedUser: "synthetic_user", startDate: "2026-07-01", endDate: "2026-07-07", runs: 20, variant: "escaped_username", concurrency: 1 }, { benchmarkRunId: "bench-test", shouldCancel: () => cancelled, fetchSample: async (runNumber) => { cancelled = runNumber === 1; return { httpStatus: "200", requestSucceeded: true, rawEventCount: 0, entries: [], apiDurationMs: 1, logicalFetchDurationMs: 1, classification: "http_200_no_entries", physicalRequests: [] }; } });
  assert.equal(run.status, "cancelled");
  assert.equal(run.samples.length, 1);
  console.log("Activity Stream benchmark tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
