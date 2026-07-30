import { Component, type ErrorInfo, type ReactNode } from "react";
import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { createIncidentId, reportRendererDiagnostic } from "../diagnostics/rendererDiagnostics";

type Props = {
  children: ReactNode;
  context: string;
  resetKey?: string;
  safeText?: string;
};

type State = {
  error: Error | null;
  incidentId: string;
  showSafeText: boolean;
};

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null, incidentId: "", showSafeText: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, incidentId: createIncidentId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRendererDiagnostic("local_error_boundary", {
      error,
      componentStack: info.componentStack,
      context: this.props.context,
      contentLength: this.props.safeText?.length ?? 0
    }, this.state.incidentId);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, incidentId: "", showSafeText: false });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" data-testid="section-error-boundary">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0 flex-1">
            <b>此區塊無法顯示 / This section could not be rendered</b>
            <div className="mt-1 text-xs">Reference: {this.state.incidentId}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={() => this.setState({ error: null, incidentId: "", showSafeText: false })}><RefreshCw size={14} />Retry</button>
          {this.props.safeText ? <button className="btn" type="button" onClick={() => this.setState((state) => ({ ...state, showSafeText: !state.showSafeText }))}><ChevronDown size={14} />Show safe text</button> : null}
        </div>
        {this.state.showSafeText ? <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 text-xs">{this.props.safeText}</pre> : null}
      </div>
    );
  }
}
