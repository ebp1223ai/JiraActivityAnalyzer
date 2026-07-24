import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { buildInfo } from "./buildInfo";
import { AnalysisPage } from "./routes/AnalysisPage";
import { ConnectionsPage } from "./routes/ConnectionsPage";
import { DashboardPage } from "./routes/DashboardPage";
import { ImportPage } from "./routes/ImportPage";
import { JiraAnalysisPage } from "./routes/JiraAnalysisPage";
import { JiraProbePage } from "./routes/JiraProbePage";
import { PrecisionProbePage } from "./routes/PrecisionProbePage";
import { SettingsPage } from "./routes/SettingsPage";
import { TimelinePage } from "./routes/TimelinePage";
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
  }, []);

  return (
    <RuntimeStatusProvider>
      <ConnectionProvider>
        <SessionStateProvider>
          <UiSmokeErrorTrigger />
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route path="/precision-probe" element={<PrecisionProbePage />} />
              <Route path="/jira-analysis" element={<JiraAnalysisPage />} />
              <Route path="/jira-probe" element={<JiraProbePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SessionStateProvider>
      </ConnectionProvider>
    </RuntimeStatusProvider>
  );
}
