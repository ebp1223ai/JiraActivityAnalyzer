import type { ActivityStreamResultClassification, PhysicalHttpRequestDiagnostic, RoundWindowFetchResult } from "./activityStreamRoundStability.js";

export type ActivityStreamBenchmarkConfig = {
  selectedUser: string;
  startDate: string;
  endDate: string;
  runs: number;
  variant: "escaped_username";
  concurrency: 1;
};

export type ActivityStreamBenchmarkSample = {
  runNumber: number;
  startTime: string;
  endTime: string;
  logicalDurationMs: number;
  physicalHttpRequestCount: number;
  httpDurationMs: number;
  processingDurationMs: number;
  httpStatus: string;
  responseBytes: number;
  atomEntryCount: number;
  parsedEventCount: number;
  timeout: boolean;
  resultClassification: ActivityStreamResultClassification;
  physicalRequests: PhysicalHttpRequestDiagnostic[];
};

export type DurationStats = { min: number | null; median: number | null; average: number | null; p90: number | null; max: number | null };

export type ActivityStreamBenchmarkSummary = {
  runCount: number; successCount: number; timeoutCount: number; httpErrorCount: number;
  logicalWindow: DurationStats; physicalHttp: DurationStats; processing: DurationStats;
  averageResponseBytes: number; averageEventCount: number; paginationCount: number; retryCount: number;
};

export type ActivityStreamBenchmarkRun = {
  schemaVersion: "activity_stream_benchmark_v1";
  benchmarkRunId: string;
  config: ActivityStreamBenchmarkConfig;
  startedAt: string;
  completedAt: string;
  status: "completed" | "cancelled" | "failed";
  samples: ActivityStreamBenchmarkSample[];
  summary: ActivityStreamBenchmarkSummary;
};

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}

export function durationStats(values: number[]): DurationStats {
  if (!values.length) return { min: null, median: null, average: null, p90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0]!, median: percentile(sorted, 0.5), average: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length), p90: percentile(sorted, 0.9), max: sorted[sorted.length - 1]! };
}

export function summarizeBenchmark(samples: ActivityStreamBenchmarkSample[]): ActivityStreamBenchmarkSummary {
  const physical = samples.flatMap((sample) => sample.physicalRequests);
  const successful = samples.filter((sample) => sample.resultClassification === "http_200_with_entries" || sample.resultClassification === "http_200_no_entries");
  return {
    runCount: samples.length,
    successCount: successful.length,
    timeoutCount: samples.filter((sample) => sample.resultClassification === "timeout").length,
    httpErrorCount: samples.filter((sample) => sample.resultClassification === "http_error" || sample.resultClassification === "network_error").length,
    logicalWindow: durationStats(samples.map((sample) => sample.logicalDurationMs)),
    physicalHttp: durationStats(physical.map((request) => request.httpDurationMs)),
    processing: durationStats(samples.map((sample) => sample.processingDurationMs)),
    averageResponseBytes: samples.length ? Math.round(samples.reduce((sum, sample) => sum + sample.responseBytes, 0) / samples.length) : 0,
    averageEventCount: samples.length ? Math.round(samples.reduce((sum, sample) => sum + sample.parsedEventCount, 0) / samples.length) : 0,
    paginationCount: physical.filter((request) => request.pagination).length,
    retryCount: physical.filter((request) => request.retry).length
  };
}

export async function executeActivityStreamBenchmark(config: ActivityStreamBenchmarkConfig, options: {
  benchmarkRunId: string;
  fetchSample: (runNumber: number) => Promise<RoundWindowFetchResult & { processingDurationMs?: number }>;
  shouldCancel?: () => boolean;
  onProgress?: (progress: { benchmarkRunId: string; currentRun: number; totalRuns: number; completedRuns: number; status: string }) => void;
}): Promise<ActivityStreamBenchmarkRun> {
  if (!config.selectedUser.trim()) throw new Error("User is required. / 使用者為必填。");
  if (!Number.isInteger(config.runs) || config.runs < 1 || config.runs > 20) throw new Error("Runs must be an integer from 1 to 20. / 執行次數必須為 1 到 20 的整數。");
  if (config.variant !== "escaped_username" || config.concurrency !== 1) throw new Error("Benchmark requires escaped_username and concurrency 1.");
  const startedAt = new Date().toISOString();
  const samples: ActivityStreamBenchmarkSample[] = [];
  for (let index = 0; index < config.runs; index += 1) {
    if (options.shouldCancel?.()) break;
    const runNumber = index + 1;
    options.onProgress?.({ benchmarkRunId: options.benchmarkRunId, currentRun: runNumber, totalRuns: config.runs, completedRuns: samples.length, status: "running" });
    const sampleStarted = Date.now();
    const fetched = await options.fetchSample(runNumber);
    const sampleCompleted = Date.now();
    const physicalRequests = fetched.physicalRequests ?? [];
    samples.push({
      runNumber, startTime: new Date(sampleStarted).toISOString(), endTime: new Date(sampleCompleted).toISOString(),
      logicalDurationMs: fetched.logicalFetchDurationMs ?? fetched.apiDurationMs,
      physicalHttpRequestCount: physicalRequests.length || 1,
      httpDurationMs: physicalRequests.reduce((sum, request) => sum + request.httpDurationMs, 0) || fetched.apiDurationMs,
      processingDurationMs: fetched.processingDurationMs ?? 0,
      httpStatus: fetched.httpStatus,
      responseBytes: physicalRequests.reduce((sum, request) => sum + request.responseBytes, 0),
      atomEntryCount: fetched.rawEventCount,
      parsedEventCount: fetched.entries.length,
      timeout: fetched.classification === "timeout",
      resultClassification: fetched.classification ?? "network_error",
      physicalRequests
    });
  }
  const cancelled = samples.length < config.runs && options.shouldCancel?.() === true;
  const run: ActivityStreamBenchmarkRun = { schemaVersion: "activity_stream_benchmark_v1", benchmarkRunId: options.benchmarkRunId, config, startedAt, completedAt: new Date().toISOString(), status: cancelled ? "cancelled" : "completed", samples, summary: summarizeBenchmark(samples) };
  options.onProgress?.({ benchmarkRunId: options.benchmarkRunId, currentRun: samples.length, totalRuns: config.runs, completedRuns: samples.length, status: run.status });
  return run;
}

export function benchmarkCsv(run: ActivityStreamBenchmarkRun): string {
  const headers = ["Run Number", "Start Time", "End Time", "Logical Duration Ms", "Physical HTTP Request Count", "HTTP Duration Ms", "Processing Duration Ms", "HTTP Status", "Response Bytes", "Atom Entries", "Parsed Events", "Timeout", "Result Classification"];
  const rows = run.samples.map((sample) => [sample.runNumber, sample.startTime, sample.endTime, sample.logicalDurationMs, sample.physicalHttpRequestCount, sample.httpDurationMs, sample.processingDurationMs, sample.httpStatus, sample.responseBytes, sample.atomEntryCount, sample.parsedEventCount, sample.timeout, sample.resultClassification]);
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${headers.map(cell).join(",")}\r\n${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
