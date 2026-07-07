import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AnalysisPage } from "./routes/AnalysisPage";
import { ConnectionsPage } from "./routes/ConnectionsPage";
import { DashboardPage } from "./routes/DashboardPage";
import { ImportPage } from "./routes/ImportPage";
import { JiraAnalysisPage } from "./routes/JiraAnalysisPage";
import { JiraProbePage } from "./routes/JiraProbePage";
import { SettingsPage } from "./routes/SettingsPage";
import { TimelinePage } from "./routes/TimelinePage";
import { ConnectionProvider } from "./state/ConnectionContext";

export default function App() {
  return (
    <ConnectionProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/jira-analysis" element={<JiraAnalysisPage />} />
          <Route path="/jira-probe" element={<JiraProbePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ConnectionProvider>
  );
}
