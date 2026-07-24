import { Component, type ErrorInfo, type ReactNode } from "react";
import { Clipboard, FolderOpen, House, RefreshCw, TriangleAlert } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { createIncidentId, reportRendererDiagnostic } from "../diagnostics/rendererDiagnostics";

type Props = { children: ReactNode };
type State = { error: Error | null; incidentId: string };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, incidentId: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, incidentId: createIncidentId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRendererDiagnostic("react_error_boundary", {
      error,
      componentStack: info.componentStack
    }, this.state.incidentId);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const reference = this.state.incidentId || "renderer-unknown";
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6" data-testid="app-error-boundary">
        <section className="w-full max-w-2xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-red-100 p-3 text-red-700"><TriangleAlert size={28} /></div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-950">Jira Activity Analyzer encountered a renderer error</h1>
              <p className="mt-2 leading-relaxed text-slate-600">
                The application stayed open and saved a sanitized diagnostic record. No token or Authorization value is shown here.
              </p>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm" data-testid="error-incident-id">
                Incident: {reference}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={16} />Reload application
            </button>
            <button className="btn" type="button" onClick={() => { window.location.hash = "#/"; window.location.reload(); }}>
              <House size={16} />Return to Dashboard
            </button>
            <button className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(reference)}>
              <Clipboard size={16} />Copy error reference
            </button>
            <button className="btn" type="button" onClick={() => void window.desktopApp?.appDiagnostics?.openLogsFolder()}>
              <FolderOpen size={16} />Open logs folder
            </button>
          </div>
          <div className="mt-5 text-xs font-semibold text-slate-500">
            {buildInfo.version} | Build {buildInfo.buildTime} | Commit {buildInfo.gitCommit}
          </div>
        </section>
      </main>
    );
  }
}
