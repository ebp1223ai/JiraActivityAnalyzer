import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { buildInfo } from "./buildInfo";
import { AnalysisPage } from "./routes/AnalysisPage";
import { ConnectionsPage } from "./routes/ConnectionsPage";
import { DashboardPage } from "./routes/DashboardPage";
import { JiraProbePage } from "./routes/JiraProbePage";
import { PrecisionProbePage } from "./routes/PrecisionProbePage";
import { SettingsPage } from "./routes/SettingsPage";
import { IssueViewerPage } from "./routes/IssueViewerPage";
import { UserViewerPage } from "./routes/UserViewerPage";
import { ConnectionProvider } from "./state/ConnectionContext";
import { SessionStateProvider } from "./state/SessionStateContext";
import { RuntimeStatusProvider } from "./state/RuntimeStatusContext";

function UiSmokeErrorTrigger() {
  const [shouldThrow, setShouldThrow] = useState(false);
  useEffect(() => {
    if (!window.desktopApp?.uiSmoke) return;
    const trigger = () => setShouldThrow(true);
    window.addEventListener("jaa:test-error-boundary", trigger);
    return () => window.removeEventListener("jaa:test-error-boundary", trigger);
  }, []);
  if (shouldThrow) throw new Error("Controlled renderer error: Authorization: Bearer ui-smoke-secret");
  return null;
}

export default function App() {
  useEffect(() => {
    document.title = `Jira Activity Analyzer ${buildInfo.version}`;
    requestAnimationFrame(() => {
      void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "startup_milestone", milestone: "First Paint" });
      void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "startup_milestone", milestone: "Shell Visible" });
      void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: "startup_milestone", milestone: "Initial Route Ready" });
    });
  }, []);

  return (
    <RuntimeStatusProvider>
      <ConnectionProvider>
        <SessionStateProvider>
          <UiSmokeErrorTrigger />
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/database" replace />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/database" element={<DashboardPage />} />
              <Route path="/collection" element={<AnalysisPage />} />
              <Route path="/issues" element={<IssueViewerPage />} />
              <Route path="/users" element={<UserViewerPage />} />
              <Route path="/activity-stream-probe" element={<PrecisionProbePage />} />
              <Route path="/jira-probe" element={<JiraProbePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/import" element={<Navigate to="/collection" replace />} />
              <Route path="/analysis" element={<Navigate to="/collection" replace />} />
              <Route path="/timeline" element={<Navigate to="/users" replace />} />
              <Route path="/precision-probe" element={<Navigate to="/activity-stream-probe" replace />} />
              <Route path="/jira-analysis" element={<Navigate to="/issues" replace />} />
              <Route path="*" element={<Navigate to="/database" replace />} />
            </Route>
          </Routes>
        </SessionStateProvider>
      </ConnectionProvider>
    </RuntimeStatusProvider>
  );
}
