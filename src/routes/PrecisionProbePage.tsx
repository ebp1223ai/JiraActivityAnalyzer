import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { DatabaseZap, Download, Play, Radio } from "lucide-react";
import { buildInfo } from "../buildInfo";
import type { AppOutletContext } from "../components/AppLayout";
import { FieldLabel } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { useSessionState, type UserActivityStreamResult, type UserAnalysisCandidateIssue, type UserAnalysisPrecisionProbeResult, type UserAnalysisPrecisionProbeSummary } from "../state/SessionStateContext";

function parseUsers(input: string) {
  return Array.from(new Set(input.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean)));
}

function jqlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function addDays(dateText: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return dateText;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildBaseJql(users: string[], startDate: string, endDate: string) {
  const endExclusive = addDays(endDate, 1);
  const roles = users.length === 1
    ? `assignee = ${jqlString(users[0])} OR reporter = ${jqlString(users[0])} OR creator = ${jqlString(users[0])}`
    : `assignee in (${users.map(jqlString).join(", ")}) OR reporter in (${users.map(jqlString).join(", ")}) OR creator in (${users.map(jqlString).join(", ")})`;
  return `(${roles}) AND updated >= "${startDate}" AND updated < "${endExclusive}" ORDER BY updated DESC, created DESC, key DESC`;
}

function stamp() {
  const date = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 rounded-lg border border-line bg-white p-3"><div className="text-xs font-black uppercase leading-snug text-muted">{label}</div><div className="mt-1 break-words text-2xl font-black text-ink" data-no-clip="true">{value}</div></div>;
}

export function PrecisionProbePage() {
  const { activeConnection } = useConnectionContext();
  const { userAnalysis, setUserAnalysis } = useSessionState();
  const { appendDebugLog, getDebugLogs } = useOutletContext<AppOutletContext>();
  const selectedUsers = useMemo(() => parseUsers(userAnalysis.selectedUsersText), [userAnalysis.selectedUsersText]);
  const endExclusive = addDays(userAnalysis.endDate, 1);
  const connectionReady = Boolean(window.desktopApp?.uiSmoke || (activeConnection?.baseUrl && activeConnection?.apiToken));

  function patchState(patch: Partial<typeof userAnalysis>) {
    setUserAnalysis((current) => ({ ...current, ...patch }));
  }

  function logAction(category: "USER_ACTION" | "GUARD" | "UI_MODAL" | "INFO", message: string) {
    appendDebugLog("precision", [`[${category}] ${message}`]);
    void window.desktopApp?.userAnalysis?.logAction?.({ category, message }).then((result) => {
      if (result?.actionLogPath) patchState({ actionLogPath: result.actionLogPath, actionLogAvailable: result.actionLogAvailable ?? true });
    });
  }

  function smokeConnection() {
    return activeConnection ?? (window.desktopApp?.uiSmoke ? {
      id: "ui-smoke", name: "UI Smoke Connection", baseUrl: "https://jira.example.invalid", authType: "bearer" as const, apiVersion: "v2" as const,
      username: "smoke.user", email: "smoke.user@example.invalid", apiToken: "ui-smoke-masked", tokenSource: "session" as const,
      tokenMasked: "****", status: "not_tested" as const, lastTestedAt: "", authenticatedUser: "", accessibleProjectsCount: 0, active: true
    } : null);
  }

  function validate() {
    if (selectedUsers.length === 0) return "Please enter at least one selected user. / 請輸入至少一位使用者。";
    if (!userAnalysis.activityStreamUser.trim()) return "Please enter Activity Stream User. / 請輸入 Activity Stream 使用者。";
    if (!userAnalysis.startDate || !userAnalysis.endDate || userAnalysis.startDate > userAnalysis.endDate) return "Please enter a valid date range. / 請輸入有效日期範圍。";
    if (!smokeConnection()) return "Jira connection is not ready. / Jira 連線尚未就緒。";
    return "";
  }

  async function runActivityStreamOnly() {
    logAction("USER_ACTION", "Button clicked: Run Activity Stream Probe / 執行 Activity Stream 測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    patchState({ precisionProbeStatus: "running", precisionProbeErrors: [], notice: "" });
    try {
      const response = await window.desktopApp?.userAnalysis?.activityStreamProbe?.({
        connection: smokeConnection()!, selectedUsers, activityStreamUser: userAnalysis.activityStreamUser.trim(), queryMode: userAnalysis.activityStreamQueryMode, startDate: userAnalysis.startDate,
        endDate: endExclusive, maxResults: userAnalysis.precisionProbeMaxResults
      });
      if (!response) throw new Error("Electron Activity Stream API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const activityStream = response.activityStream as unknown as UserActivityStreamResult;
      patchState({ activityStream, precisionProbeStatus: activityStream.overallStatus === "failed" ? "failed" : "completed", precisionProbeErrors: activityStream.error ? [activityStream.error] : [], notice: `Activity Stream Probe completed: ${activityStream.parsedActivityCount} activities, ${activityStream.activityStreamIssueKeys.length} issue key(s). / Activity Stream 測試完成。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activity Stream Probe failed.";
      patchState({ precisionProbeStatus: "failed", precisionProbeErrors: [message] });
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  async function runPrecisionProbe() {
    logAction("USER_ACTION", "Button clicked: Run Precision Probe / 執行精準查詢測試");
    const error = validate();
    if (error) return patchState({ precisionProbeErrors: [error] });
    patchState({ precisionProbeStatus: "running", precisionProbeErrors: [], precisionProbeWarnings: [], notice: "" });
    try {
      const response = await window.desktopApp?.userAnalysis?.precisionProbe?.({
        connection: smokeConnection()!, selectedUsers, startInclusive: userAnalysis.startDate, endExclusive,
        projectScope: userAnalysis.precisionProjectScope, activityStreamUser: userAnalysis.activityStreamUser.trim(),
        activityStreamQueryMode: userAnalysis.activityStreamQueryMode,
        maxResults: userAnalysis.precisionProbeMaxResults, broadJql: buildBaseJql(selectedUsers, userAnalysis.startDate, userAnalysis.endDate)
      });
      if (!response) throw new Error("Electron Precision Probe API is not available.");
      appendDebugLog("precision", Array.isArray(response.logs) ? response.logs as string[] : []);
      const summary = response.summary as unknown as UserAnalysisPrecisionProbeSummary;
      const status = String(response.status ?? "failed");
      patchState({
        precisionProbeStatus: status === "success" ? "completed" : status === "partial" ? "partial" : "failed",
        precisionProbeResults: (Array.isArray(response.results) ? response.results : []) as UserAnalysisPrecisionProbeResult[],
        precisionProbeSummary: summary,
        activityStream: response.activityStream as unknown as UserActivityStreamResult,
        precisionIssueKeySets: (response.issueKeySets ?? userAnalysis.precisionIssueKeySets) as typeof userAnalysis.precisionIssueKeySets,
        uniquePreciseIssueKeys: (Array.isArray(response.uniquePreciseIssueKeys) ? response.uniquePreciseIssueKeys : []) as string[],
        precisionIssueSources: (response.issueSources ?? {}) as Record<string, string[]>,
        precisionProbeWarnings: (Array.isArray(response.warnings) ? response.warnings : []) as string[],
        precisionProbeErrors: (Array.isArray(response.errors) ? response.errors : []) as string[],
        precisionProbeLastRunAt: new Date().toISOString(),
        notice: `Precision Probe completed: ${summary.uniquePreciseIssueCount} unique candidate(s). / 精準查詢測試完成。`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Precision Probe failed.";
      patchState({ precisionProbeStatus: "failed", precisionProbeErrors: [message] });
      appendDebugLog("precision", [`[ERROR] ${message}`]);
    }
  }

  function addToFetchQueue() {
    logAction("USER_ACTION", "Button clicked: Add Precise Candidates to Fetch Queue / 加入精準候選到抓取佇列");
    setUserAnalysis((current) => {
      const issues = new Map(current.candidateIssues.map((issue) => [issue.key, issue]));
      for (const key of current.precisionIssueKeySets.recommendedIssueKeys) {
        const sources = current.precisionIssueSources[key] ?? [];
        const reason = `Precision Probe matched: ${sources.join(", ") || "unknown"}`;
        const existing = issues.get(key);
        issues.set(key, existing ? { ...existing, matchedReason: existing.matchedReason.includes(reason) ? existing.matchedReason : `${existing.matchedReason}; ${reason}` } : {
          id: key, key, summary: "", status: "", assignee: "", reporter: "", creator: "", updated: "", created: "", issueType: "", priority: "", project: key.split("-")[0] ?? "", matchedReason: reason
        } satisfies UserAnalysisCandidateIssue);
      }
      return { ...current, candidateIssues: Array.from(issues.values()), selectedForFetch: Array.from(new Set([...current.selectedForFetch, ...current.precisionIssueKeySets.recommendedIssueKeys])), notice: `${current.precisionIssueKeySets.recommendedIssueKeys.length} recommended candidate(s) added to User Analysis Fetch Queue. Full Fetch was not started. / 已加入使用者分析抓取佇列，未自動執行完整抓取。` };
    });
  }

  function exportPayload() {
    return {
      exportType: "user-activity-precision-probe",
      app: { name: "Jira Activity Analyzer", version: buildInfo.version.replace(/^v/, ""), buildTime: buildInfo.buildTime, gitCommit: buildInfo.gitCommit, gitBranch: buildInfo.gitBranch },
      exportedAt: new Date().toISOString(), globalDataSourceMode: "live_jira_api",
      source: { type: "live_jira_api", baseUrl: activeConnection?.baseUrl ?? "", apiVersion: activeConnection?.apiVersion ?? "v2", authType: activeConnection?.authType ?? "bearer", readOnly: true, databaseWrite: false, attachmentDownload: false, token: "[masked]", authorization: "[masked]" },
      requestContext: { selectedUsers, activityStreamUser: userAnalysis.activityStreamUser, activityStreamQueryMode: userAnalysis.activityStreamQueryMode, dateRange: { start: userAnalysis.startDate, end: userAnalysis.endDate, endInclusive: true }, jqlDateRange: { startInclusive: userAnalysis.startDate, endExclusive }, projectScope: userAnalysis.precisionProjectScope, probeMaxResults: userAnalysis.precisionProbeMaxResults },
      summary: userAnalysis.precisionProbeSummary,
      probeResults: userAnalysis.precisionProbeResults,
      activityStream: userAnalysis.activityStream,
      issueKeySets: userAnalysis.precisionIssueKeySets,
      uniquePreciseIssueKeys: userAnalysis.uniquePreciseIssueKeys,
      recommendations: [`Recommended Stage 1 Mode: ${userAnalysis.precisionProbeSummary.recommendedStage1Mode}`, "updatedBy may not exactly match Activity Stream user actions in this Jira environment. / updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。"],
      warnings: userAnalysis.precisionProbeWarnings, errors: userAnalysis.precisionProbeErrors,
      debugLogSanitized: getDebugLogs("precision"),
      debugLogNote: "debugLogSanitized may contain the recent UI debug buffer only. See actionLogDiagnostics.actionLogPath for complete USER_ACTION / GUARD / UI_MODAL timeline.",
      actionLogDiagnostics: { actionLogPath: userAnalysis.actionLogPath, actionLogAvailable: userAnalysis.actionLogAvailable }
    };
  }

  async function saveResult() {
    logAction("USER_ACTION", "Button clicked: Save Precision Probe Result / 儲存精準查詢測試結果");
    if (userAnalysis.precisionProbeResults.length === 0 && userAnalysis.activityStream.status === "not_run") return logAction("GUARD", "Action blocked: No Precision Probe result yet / 尚無測試結果");
    patchState({ saving: true });
    try {
      const result = await window.desktopApp?.userAnalysis?.saveExport?.({ category: "user-analysis", defaultFileName: `user-activity-precision-probe-${stamp()}.json`, data: exportPayload() });
      if (!result) throw new Error("Electron export API is not available.");
      patchState({ saving: false, lastSavedPrecisionProbePath: result.filePath ?? "", lastSavedExportFolderPath: result.folderPath ?? "", notice: `Saved to: ${result.filePath}` });
      appendDebugLog("precision", [`[INFO] Precision Probe result saved: ${result.filePath}`, "[INFO] Token: [masked]", "[INFO] Authorization: [masked]"]);
    } catch (error) {
      patchState({ saving: false, precisionProbeErrors: [error instanceof Error ? error.message : "Save failed."] });
    }
  }

  const stream = userAnalysis.activityStream;
  return <>
    <PageHeader title="User Activity Precision Probe" subtitle="使用者活動精準查詢測試" />
    <SectionCard className="mb-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold leading-relaxed text-cyan-950">Activity Stream is the preferred actual-activity validation source. updatedBy remains a candidate source and may include automation or indexing effects.<br />Activity Stream 優先作為實際活動驗證來源；updatedBy 僅為候選來源，可能包含自動化或索引影響。</div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div><FieldLabel label="Selected Users" sub="選擇使用者" /><textarea className="field min-h-24" value={userAnalysis.selectedUsersText} onChange={(event) => patchState({ selectedUsersText: event.target.value })} /></div>
        <div><FieldLabel label="Activity Stream User" sub="Activity Stream 使用者" /><input data-testid="activity-stream-user" className="field" value={userAnalysis.activityStreamUser} placeholder="roger_hsieh or roger_hsieh@phison.com" onChange={(event) => { logAction("USER_ACTION", `Activity Stream User changed: value=${event.target.value}`); patchState({ activityStreamUser: event.target.value }); }} /><div className="mt-2 text-xs font-semibold text-muted">Username and email are supported. / 支援 username 與 email。</div></div>
        <div><FieldLabel label="Activity Stream Query Mode" sub="活動串流查詢模式" /><select data-testid="activity-stream-query-mode" className="field" value={userAnalysis.activityStreamQueryMode} onChange={(event) => { const value = event.target.value as typeof userAnalysis.activityStreamQueryMode; logAction("USER_ACTION", `Activity Stream Query Mode changed: value=${value}`); patchState({ activityStreamQueryMode: value }); }}><option value="auto">Auto / 自動（建議）</option><option value="username">Username</option><option value="email">Email</option><option value="custom">Custom / 自訂</option></select><div className="mt-2 text-xs font-semibold leading-relaxed text-muted">Auto tries compatible username and email variants without duplicates. / 自動模式會依序測試相容的 username 與 email。</div></div>
        <div className="grid grid-cols-2 gap-2"><div><FieldLabel label="Start Date" sub="開始日期" /><input className="field" type="date" value={userAnalysis.startDate} onChange={(event) => patchState({ startDate: event.target.value })} /></div><div><FieldLabel label="End Date" sub="結束日期" /><input className="field" type="date" value={userAnalysis.endDate} onChange={(event) => patchState({ endDate: event.target.value })} /></div></div>
        <div><FieldLabel label="Project Scope" sub="專案範圍（選填）" /><input className="field" value={userAnalysis.precisionProjectScope} placeholder="COPGEN1, FW" onChange={(event) => patchState({ precisionProjectScope: event.target.value })} /></div>
        <div><FieldLabel label="Probe Max Results" sub="測試最大筆數" /><select className="field" value={userAnalysis.precisionProbeMaxResults} onChange={(event) => { const value = Number(event.target.value) as 0 | 10 | 20 | 50; logAction("USER_ACTION", `Probe Max Results changed: value=${value}`); patchState({ precisionProbeMaxResults: value }); }}>{[0, 10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className="rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-muted">Activity Stream request range: {userAnalysis.startDate || "-"} .. {endExclusive || "-"}<br />activityStreamDateSemantics: unknown</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button data-testid="run-activity-stream" className="btn" type="button" disabled={!connectionReady || userAnalysis.precisionProbeStatus === "running"} onClick={() => void runActivityStreamOnly()}><Radio size={16} />Run Activity Stream Probe / 執行 Activity Stream 測試</button><button data-testid="run-precision-probe" className="btn btn-primary" type="button" disabled={!connectionReady || userAnalysis.precisionProbeStatus === "running"} onClick={() => void runPrecisionProbe()}><Play size={16} />Run Precision Probe / 執行精準查詢測試</button><button data-testid="save-precision-probe" className="btn" type="button" disabled={userAnalysis.saving || (userAnalysis.precisionProbeResults.length === 0 && stream.status === "not_run")} onClick={() => void saveResult()}><Download size={16} />Save Precision Probe Result / 儲存精準查詢測試結果</button><button data-testid="add-precision-queue" className="btn" type="button" disabled={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length === 0} onClick={addToFetchQueue}><DatabaseZap size={16} />Add Recommended Keys to Fetch Queue / 加入建議 Jira 到抓取佇列</button></div>
      {userAnalysis.notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{userAnalysis.notice}</div> : null}
    </SectionCard>

    <SectionCard title="Activity Stream Result" subtitle="Activity Stream 結果" className="mb-4">
      <div className="mb-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3"><MiniStat label="Overall Status / 整體狀態" value={stream.overallStatus} /><MiniStat label="Reachable / 可連線" value={stream.reachable ? "yes" : "no"} /><MiniStat label="Supported / 是否支援" value={stream.supported} /><MiniStat label="Parsed / 已解析" value={stream.parsed ? "yes" : "no"} /><MiniStat label="Diagnosis / 診斷" value={stream.diagnosis} /><MiniStat label="Best Variant / 最佳變體" value={stream.bestVariant || "-"} /><MiniStat label="Atom Entries / Atom 項目" value={stream.atomEntryCount} /><MiniStat label="Parsed Activities / 活動數" value={stream.parsedActivityCount} /><MiniStat label="Activity Stream Jira / Jira 數" value={stream.activityStreamIssueKeys.length} /></div>
      <div className="mb-3 break-all rounded-lg border border-line bg-slate-50 p-3 text-xs font-semibold text-muted">GET {stream.requestUrlSanitized || "/plugins/servlet/streams?..."}<br />Date semantics / 日期語意：{stream.activityStreamDateSemantics}</div>
      <h3 className="mb-2 text-sm font-black text-ink">Query Variants / 查詢變體</h3>
      <ResponsiveTableContainer className="mb-4"><table className="table min-w-[1200px]" data-testid="activity-stream-variants"><thead><tr>{["Variant", "User", "HTTP", "Content Type", "Reachable", "Supported", "Atom Entries", "Parsed", "Jira Keys", "Diagnosis"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{stream.variantResults.map((result) => <tr key={`${result.variant}-${result.activityStreamUser}`}><td className="font-bold">{result.variant}</td><td>{result.activityStreamUser}</td><td>{result.httpStatus}</td><td>{result.contentType || "-"}</td><td>{result.reachable ? "yes" : "no"}</td><td>{result.supported}</td><td>{result.atomEntryCount}</td><td>{result.parsedActivityCount}</td><td>{result.parsedIssueKeys.join(", ") || "-"}</td><td><StatusBadge>{result.diagnosis}</StatusBadge></td></tr>)}{stream.variantResults.length === 0 ? <tr><td colSpan={10} className="text-center text-muted">No query variants yet / 尚無查詢變體</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      <h3 className="mb-2 text-sm font-black text-ink">Parsed Entries / 解析項目</h3>
      <ResponsiveTableContainer><table className="table min-w-[1100px]" data-testid="activity-stream-results"><thead><tr>{["Time / 時間", "Issue Key / Jira", "Extracted Keys", "Variant", "Activity Type / 活動類型", "Title / 標題", "Author / 作者", "Source / 來源"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{stream.entriesSanitized.map((entry, index) => <tr key={`${entry.issueKey}-${entry.activityTime}-${index}`}><td>{entry.activityTime || "-"}</td><td className="font-black text-blue-700">{entry.issueKey || "-"}</td><td>{entry.extractedIssueKeysPerEntry.join(", ") || "-"}</td><td>{entry.variant || "-"}</td><td>{entry.activityType}</td><td><span className="block max-w-[360px] truncate" title={entry.activityTitle} data-allow-truncate="true">{entry.activityTitle || "-"}</span></td><td>{entry.activityAuthor || "-"}</td><td>{entry.source}</td></tr>)}{stream.entriesSanitized.length === 0 ? <tr><td colSpan={8} className="text-center text-muted">No parsed Activity Stream entries / 尚無解析結果</td></tr> : null}</tbody></table></ResponsiveTableContainer>
      {stream.error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{stream.error}</div> : null}
    </SectionCard>

    {userAnalysis.precisionProbeResults.length > 0 ? <><SectionCard title="Precision Probe Summary" subtitle="精準查詢測試摘要" className="mb-4"><div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"><MiniStat label="updatedBy Candidate / 候選來源" value={userAnalysis.precisionProbeSummary.updatedBySupported} /><MiniStat label="Activity Stream" value={userAnalysis.precisionProbeSummary.activityStreamSupported} /><MiniStat label="CHANGED BY" value={userAnalysis.precisionProbeSummary.changedBySupported} /><MiniStat label="Broad Baseline / 寬鬆基準" value={userAnalysis.precisionProbeSummary.broadCandidateCount} /><MiniStat label="Recommended Jira / 建議 Jira" value={userAnalysis.precisionIssueKeySets.recommendedIssueKeys.length} /><MiniStat label="Potential Reduction / 預估減少" value={userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent === null ? "N/A" : `${userAnalysis.precisionProbeSummary.potentialFullFetchReductionPercent}%`} /></div><div data-testid="precision-recommendation" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Recommended Stage 1 Mode / 建議第一階段模式：{userAnalysis.precisionProbeSummary.recommendedStage1Mode}<br />Recommended Issue Keys / 建議 Jira：{userAnalysis.precisionIssueKeySets.recommendedIssueKeys.join(", ") || "-"}</div><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-900">Candidate Issue Keys / 候選 Jira（updatedBy）：{userAnalysis.precisionIssueKeySets.updatedByCandidateIssueKeys.join(", ") || "-"}<br />updatedBy may not exactly match Activity Stream user actions in this Jira environment.<br />updatedBy 在此 Jira 環境中不一定等同於 Activity Stream 實際使用者操作紀錄。</div></SectionCard><SectionCard title="Probe Results" subtitle="測試結果" className="mb-4"><ResponsiveTableContainer><table className="table min-w-[1280px]" data-testid="precision-results-table"><thead><tr>{["Probe Method / 測試方法", "Status / 狀態", "HTTP", "Supported / 支援", "Count / 數量", "Sample Issue Keys", "Candidate Source", "Error", "Recommendation"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{userAnalysis.precisionProbeResults.map((result) => <tr key={result.candidateSource}><td className="font-bold">{result.method}</td><td><StatusBadge>{result.status}</StatusBadge></td><td>{result.httpStatus}</td><td>{result.supported}</td><td className="font-black">{result.resultCount}</td><td>{result.sampleIssueKeys.join(", ") || "-"}</td><td>{result.candidateSource}</td><td>{result.error || "-"}</td><td>{result.recommendation}</td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard></> : null}
    {[...userAnalysis.precisionProbeWarnings, ...userAnalysis.precisionProbeErrors].map((message) => <div key={message} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{message}</div>)}
  </>;
}
